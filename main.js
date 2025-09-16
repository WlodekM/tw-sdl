import { createCanvas, loadImage } from '@napi-rs/canvas';
import VM from "./scratch-vm/src/virtual-machine.js";
import fs from 'node:fs'
import decompress from 'decompress'
import scratchStorage from 'scratch-storage';
import express from 'express'
import Runtime from './scratch-vm/src/engine/runtime.js';
import Target from './scratch-vm/src/engine/target.js';
import RenderedTarget from './scratch-vm/src/sprites/rendered-target.js';
import yargs from 'yargs';
import path from 'node:path';

const args = yargs(process.argv).argv;
if (typeof __dirname != 'string')
	globalThis.__dirname = undefined;
const dirname = __dirname ?? import.meta.dirname

/** var for collision boxes */
let scene = [];
const HEADLESS = process.argv.includes('--headless') || process.argv.includes('-h')
/** @this {RenderedTarget} */
RenderedTarget.prototype.isTouchingPoint = function(x, y) {
	// console.log(`isTouchingPoint[${this.id}](${x}, ${y})`)
	//TODO - fancy touching logic
	//TODO - rotations
	// const [ex, ey] = [this.x, this.y];
	// const [ew, eh] = [this.w, this.y];
	const thisId = this.id;
	const element = scene.find(e => e.targetId == thisId);
	// console.log(element)
	if (!element)
		return false
	if (
		x >= element.x - (element.width / 2) &&
		y >= element.y - (element.height / 2) &&
		x <= element.x + (element.width / 2) &&
		y <= element.y + (element.height / 2)
	)
		return true;
	return false;
}
RenderedTarget.prototype.getBoundsForBubble = ()=>{throw 'throw!'}
// import path from 'node:path/posix'

function requestAnimationFrame(f){
  setImmediate(()=>f(Date.now()))
}

if (fs.existsSync(path.join(dirname, 'temp-project')))
	fs.rmSync(path.join(dirname, 'temp-project'), {recursive: true})
fs.mkdirSync(path.join(dirname, 'temp-project'))
await decompress(args._[2] ?? 'Project-framerate.sb3', path.join(dirname, 'temp-project'), {})

const storage = new scratchStorage.ScratchStorage();

const storageServerApp = express(); //FIXME - figure out a better way to load assets
storageServerApp.use(express.static(path.join(dirname, 'temp-project')));
const storageServer = storageServerApp.listen(59382)

const DataFormat = {
    JPG: 'jpg',
    JSON: 'json',
    MP3: 'mp3',
    PNG: 'png',
    SB2: 'sb2',
    SB3: 'sb3',
    SVG: 'svg',
    WAV: 'wav'
}
const AssetType = {
	ImageBitmap: {
		contentType: 'image/png',
		name: 'ImageBitmap',
		runtimeFormat: DataFormat.PNG,
		immutable: true
	},
	ImageVector: {
		contentType: 'image/svg+xml',
		name: 'ImageVector',
		runtimeFormat: DataFormat.SVG,
		immutable: true
	},
	Project: {
		contentType: 'application/json',
		name: 'Project',
		runtimeFormat: DataFormat.JSON,
		immutable: false
	},
	Sound: {
		contentType: 'audio/x-wav',
		name: 'Sound',
		runtimeFormat: DataFormat.WAV,
		immutable: true
	},
	Sprite: {
		contentType: 'application/json',
		name: 'Sprite',
		runtimeFormat: DataFormat.JSON,
		immutable: true
	}
}

// Scratch.workspace.addChangeListener(vm.blockListener);

var getAssetUrl = function (asset) {
    var assetUrlParts = [
        `http://localhost:59382/`,
        asset.assetId,
        '.',
        asset.dataFormat,
        // '/get/'
    ];
    return assetUrlParts.join('');
};
storage.addWebStore([AssetType.ImageVector, AssetType.ImageBitmap, AssetType.Sound],
	getAssetUrl)

const vm = new VM();
const projectJSON = fs.readFileSync(path.join(dirname, './temp-project/project.json'));

globalThis.document = {
	createElement(type) {
		if (type == 'script') {
			const thing = {};
			Object.defineProperty(thing, 'src', {
				set(value) {
					if (value.startsWith('http'))
						return fetch(value).then(r=>r.text().then(eval))
					import(value)
				}
			})
			return thing
		}
	},
	body: {
		appendChild(){}
	}
};

// console.log(projectJSON)
vm.attachStorage(storage)
vm.start();
vm.clear()
vm.setCompatibilityMode(false);
vm.setTurboMode(false);
if (HEADLESS)
	vm.runtime.on('SAY', (target, type, text) => console.log(text));

vm.securityManager.canLoadExtensionFromProject = () => true
vm.securityManager.getSandboxMode = () => 'unsandboxed'
await vm.loadProject(projectJSON)
// await vm._loadExtensions();
await vm.extensionManager.allAsyncExtensionsLoaded();

storageServer.close()

// vm.runtime.frameLoop.start()

const Scratch = globalThis.Scratch = {
	vm
}

const debugMode = process.argv.includes('-d')
if (debugMode) {
	vm.enableDebug()
	vm.runtime.enableDebug()
	vm.runtime.debug = true
}
if(!HEADLESS) {
	const sdl = await import('@kmamal/sdl')
	vm.runtime.on(Runtime.FRAMERATE_CHANGED, () => {
		// console.log('done', vm.runtime.threads)
		// drawSprites()
		fps =vm?.runtime?.frameLoop?.framerate;
	})
	// vm.runtime.start()
	// /** @type {Target} */
	// const target = vm.runtime.targets[1];
	// console.log(vm.runtime.threads)

	/////////////////////////////////////////////////

	const [width, height] = [vm.runtime.stageWidth?? 480,vm.runtime.stageHeight?? 360]

	const canvas = createCanvas(width, height)
	const ctx = canvas.getContext('2d');
	function makeWindow() {
		const config = {
			title: "SDL-Warp",
			width: width,
			height: height,
			// borderless: true,
			// resizable: false,
			// skipTaskbar: true
			// alwaysOnTop: true,
			//flags: sdl.video.POPUP_MENU, // or POPUP_MENU
			// flags: 0x0000000040000000

		}
		if (sdl.video?.createWindow)
			return sdl.video?.createWindow(config)
		return new sdl.Window(config)
	}
	const window = makeWindow();

	window.show();

	function render() {
		const buffer = Buffer.from(ctx.getImageData(0, 0, width, height).data)
		fs.writeFileSync('canvas.bin', buffer)
		window.render(width, height, width * 4, 'rgba32', buffer)
	}

	let fps = vm?.runtime?.frameLoop?.framerate ?? 30; //TODO - get this from runtime somehow
	var delay = 1000 / fps,								 // calc. time per frame
		time = null,									 // start time
		frame = -1,										 // frame count
		tref;											 // rAF time reference
	// LET IT RIPP
	vm.greenFlag()
	// actually nvm
	vm.runtime.frameLoop.stop()

	// vm.runtime.emit()
	// vm.postIOData('mouse')
	let isDragging = false;
	window.on("mouseMove", ({button, x, y, ...uh}) => {
		const coordinates = {
			isDown: typeof button == 'number',
			button: button,
			x: x,// + (width),
			y: y,// + (height),
			canvasWidth: width,
			canvasHeight: height,
			wasDragged: isDragging
		};
		// console.log(x - (width / 2), y - (height / 2), uh)
		vm.postIOData('mouse', coordinates)
		isDragging = typeof button == 'number'
	})
	if (process.argv.includes('-e'))
		window.on("*", console.log)
	const KEYS = {
		space: ' ',
	}
	window.on('keyDown', (e) => {
		if (debugMode) {
			//jank
			if (e.key == 'home') {
				console.log(vm.runtime.targets)
			} else if (e.key == 'end') {
				console.log(vm.runtime.frameLoop, fps, delay)
			}
		}
		if (!e.key) return console.warn(`Unknown key`, e)
		let key = e.key;
		key = key.split('');
		key[0] = key[0].toUpperCase();
		key = key.join('');
		vm.postIOData('keyboard', {
			isDown: true,
			keyCode: e.scancode,
			key: KEYS[e.key]??key
		})
	})
	window.on('keyUp', (e) => {
		if (!e.key) return console.warn(`Unknown key`, e)
		let key = e.key;
		key = key.split('');
		key[0] = key[0].toUpperCase();
		key = key.join('');
		vm.postIOData('keyboard', {
			isDown: false,
			keyCode: e.scancode,
			key: KEYS[e.key]??key
		})
	})

	vm.runtime.ioDevices.mouse._pickTarget = function (x, y) {
		for (const element of scene) {
			if (
				x >= element.x &&
				y >= element.y &&
				x <= element.x + element.width &&
				y <= element.y + element.height
			)
				return element.target
		}
		return this.runtime.getTargetForStage();
	}

	vm.runtime.frameLoop.setFramerate(30)
	vm.runtime.frameLoop.start()

	function createLoggingFunction(name, returner) {
		if (!debugMode)
			if (returner)
				return returner;
			else return function(){}
		if (returner)
			return function(...args) {console.log(`${name}(${args.join(", ")})`);return returner()}
		return function(...args) {console.log(`${name}(${args.join(", ")})`)}
	}

	vm.attachRenderer({
		setLayerGroupOrdering: createLoggingFunction('setLayerGroupOrdering'),
		createDrawable: createLoggingFunction('createDrawable'),
		createTextSkin: createLoggingFunction('createTextSkin'),
		updateDrawableSkinId: createLoggingFunction('updateDrawableSkinId'),
		getCurrentSkinSize: createLoggingFunction('getCurrentSkinSize',()=>[0,0]),
		getNativeSize: createLoggingFunction('getNativeSize',()=>[0,0]),
		updateDrawablePosition: createLoggingFunction('updateDrawablePosition'),
		draw: drawSprites
	})

	// console.log(vm.runtime.ioDevices.mouse._pickTarget(0, 0))
	async function drawSprites(timestamp) {
		const newSceneBuffer = []
		// const canvas = document.getElementById('scratchCanvas');
		// if (!canvas) return;
		// if (time === null) time = timestamp;              // init start time
		// var seg = Math.floor((timestamp - time) / delay); // calc frame no.
		// console.log(seg, frame, seg > frame)
		// console.log(timestamp)
		// if (seg > frame) {                                // moved to next frame?
		// 	frame = seg;                                  // update
		// } else return tref = requestAnimationFrame(drawSprites);;
		// vm.runtime.frameLoop.stepCallback()
		// canvas.style.border = '0.0625rem solid var(--ui-black-transparent)';
		// canvas.style.backgroundColor = 'white';
		
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = 'white';
		ctx.fillRect(0, 0, width, height);

		/** @type {Target[]} */
		const sprites = Scratch.vm.runtime.targets.filter(target => !target.isStage)
			.sort((a, b) => a.drawableID - b.drawableID);

		// sprites.forEach(sprite => {
		for (const sprite of sprites) {
			// console.log(sprite);
			// return;
			if (!sprite.visible) return;
			let x = canvas.width / 2 + sprite.x;
			let y = canvas.height / 2 - sprite.y;
			const size = sprite.size;
			const angle = (90 - sprite.direction) * (Math.PI / 180);

			const costume = sprite.getCurrentCostume()
			const costumeURI = costume.asset.encodeDataURI();
			let scale = size / 100;
			if (!costumeURI) return;
			// x -= costume.rotationCenterX * scale;
			// y -= costume.rotationCenterY * scale;
			// console.log(costumeURI)
			const img = await loadImage(costumeURI)//new Image();
			// img.src = costumeURI;
			// ctx.filter = '';
			// if (sprite.effects.brightness)
			ctx.filter = `brightness(${sprite.effects.brightness + 100}%) \
hue-rotate(${Math.round(sprite.effects.color / 200 * 360)}deg) \
opacity(${Math.round(100 - sprite.effects.ghost)}%)`;
			ctx.save();
			ctx.translate(x, y);
			if (sprite.rotationStyle == 'all around')
				ctx.rotate(-angle);
			///TODO - left/right rotation style logic

			if (costume.bitmapResolution) {
				// [width, height] = [width / costume.bitmapResolution, height / costume.bitmapResolution];
				scale /= costume.bitmapResolution;
			}

			let width = img.width * scale;
			let height = img.height * scale;
			newSceneBuffer.unshift({
				x: sprite.x,
				y: sprite.y,
				width,
				height,
				target: sprite,
				targetId: sprite.id
			})

			// console.log(x, y, -costume.rotationCenterX * scale, -costume.rotationCenterY * scale, width, height)
			ctx.drawImage(img, -costume.rotationCenterX * scale, -costume.rotationCenterY * scale, width, height);
			// console.log(sprite._customState)

			ctx.restore();
			ctx.fillStyle = 'black'
			if (sprite._customState['Scratch.looks'].text) {
				ctx.font = 'sans-serif 16px'
				ctx.fillText(sprite._customState['Scratch.looks'].text, width / 2 +x,  height / -2 + y)
			}

		}
		scene = newSceneBuffer;
		render()
		// console.log('frame')
		// return;
		// tref = requestAnimationFrame(drawSprites);
	}
}
else vm.greenFlag()
// requestAnimationFrame(drawSprites);
