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
	getAssetUrl);

const fast_pen_rendering = process.argv.includes('-f');

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

vm.runtime.precompile()

vm.runtime.on(Runtime.BEFORE_EXECUTE, () => {
	// console.log('step')
})

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

	let fps = vm?.runtime?.frameLoop?.framerate ?? 30;
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
	window.on('beforeClose', e => {
		/** @type {Target} */
		const stage = vm.runtime.getTargetForStage();
		if (!stage)
			return;
		if (!stage.lookupVariableByNameAndType('TW_SDL_PREVENT_CLOSE'))
			return;
		e.prevent()
	})
	window.on('close', () => {
		console.log("window destroyed, stopping project and exiting in one second if doesnt stop running")
		vm.runtime.stopAll()
		vm.runtime.once(Runtime.AFTER_EXECUTE, () => {
			console.log('exited gracefully')
			process.exit(0);
		})
		setTimeout(() => {
			console.log('timed out')
			vm.runtime.quit()
			process.exit(0);
		}, 1000)
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
	
	/**
	 * @typedef {{
	 * 	from: [number, number],
	 * 	to: [number, number],
	 * 	color: [number, number, number, number],
	 * 	width: number
	 * }} Stroke
	 */

	//TODO: make it not redraw all of the pen shit for every frame
	/** @type {Stroke[]} */
	let penStrokes = []


	vm.attachRenderer(new Proxy({
		setLayerGroupOrdering: createLoggingFunction('setLayerGroupOrdering'),
		createDrawable: createLoggingFunction('createDrawable'),
		createTextSkin: createLoggingFunction('createTextSkin'),
		updateDrawableSkinId: createLoggingFunction('updateDrawableSkinId'),
		getCurrentSkinSize: createLoggingFunction('getCurrentSkinSize',()=>[0,0]),
		getNativeSize: createLoggingFunction('getNativeSize',()=>[0,0]),
		updateDrawablePosition: createLoggingFunction('updateDrawablePosition'),
		draw: drawSprites,
		requestRedraw() {
			vm.runtime.redrawRequested = true;
			drawSprites()
		},
		createPenSkin() {
			return 1;
		},
		createDrawable() {
			return 2;
		},
		penLine(_skin, attribs, x1, y1, x2, y2) {
			console.log(x1, y1, x2, y2)
			if(!fast_pen_rendering) {
				penStrokes.push({
					from: [x1, y1],
					to: [x2, y2],
					color: [...attribs.color4f],
					width: attribs.diameter
				})
				return;
			}
			const uh = [[x1, y1], [x2, y2]].sort(([a], [b]) => a - b);
			console.log(uh)
			const [[_x1, _y1], [_x2, _y2]] =
				uh.map(([x, y]) =>
					[x + (pbWidth / 2), y + (pbHeight / 2)]
				);
			const dx = x2 - x1;
			const dy = y2 - y1;
			console.log(attribs, [[_x1, _y1], [_x2, _y2]])
			// const color = attribs.color4f.reduce((p, c, i) => {
			// 	return p | (c << (i * 8))
			// }, 0)
			const color = attribs.color4f.map(a => Math.floor(a*255))
			function set_color(x, y) {
				const i = (y * pbWidth) + x * 4;
				console.log(color, i, x, y)
				penBuffer.data[i*4+0] = color[0+0]
				penBuffer.data[i*4+1] = color[0+1]
				penBuffer.data[i*4+2] = color[0+2]
				penBuffer.data[i*4+3] = color[0+3]
			}
			if (dx != 0) {
				const m = dy/dx;
				// for x from x1 to x2 do
				for (let x = _x1; x <= _x2; x++) {
					const y = m * (x - _x1) + _y1
					// plot(x, y);
					// console.log((y * pbWidth) + x, color, y, x, m)
					set_color(x, y)
				}
			} else if (dy != 0) {
				const m = dx/dy;
				// for x from x1 to x2 do
				for (let y = _y1; y <= _y2; y++) {
					const x = m * (y - _y1) + _x1
					// plot(x, y);
					// console.log((y * pbWidth) + x, color, y, x, m)
					set_color(x, y)
				}
			}
		},
		penPoint(_skin, attribs, x, y) {
			penStrokes.push({
				from: [x, y],
				to: [x, y],
				color: [...attribs.color4f],
				width: attribs.diameter
			})
			//TODO: this
		},
		penClear() {
			penStrokes = []
		}
	}, {
		get(t, p) {
			// console.log(`runtime.${p}`);
			return t[p]
		}
	}))

	let last = Date.now()

	const costumeCache = {}

	// console.log(vm.renderer, vm.runtime.renderer)

	// RGBA buffer
	const [pbHeight, pbWidth] = [vm.runtime.stageHeight, vm.runtime.stageWidth]
	const penBuffer = ctx.createImageData(pbWidth, pbHeight);
	for (let i = 0; i < penBuffer.data.length; i+=4) {
		// if (i % 4 == 0) {
		// 	penBuffer.data[i] = 255;
		// 	continue;
		// }
		const x = (i /4 % pbHeight)
		const dx = Math.floor(x / pbWidth * 255)
		const y = Math.floor(i / 4 / pbHeight)
		penBuffer.data[i]   = dx % 255;
		penBuffer.data[i+1] = y % 255;
		console.log(x, Math.floor(x/255) * 40, i)
		penBuffer.data[i+2] = (Math.floor(x/255) * 40) % 255;
		penBuffer.data[i+3] = 255;
		// if (i % 4 == 1) {
		// 	penBuffer.data[i] = (i % 255);
		// 	continue;
		// }
		// penBuffer.data[i] = 0;
	}
	// penBuffer.data[0] = 255
	// penBuffer.data[5] = 255
	// penBuffer.data[1294] = 255
	// new Array(vm.runtime.stageHeight * vm.runtime.stageWidth)
	// 	.fill(0).map(_=>0);

	// console.log(vm.runtime.ioDevices.mouse._pickTarget(0, 0))
	function drawSprites(timestamp) {
		if (window.destroyed)
			return;
		// vm.runtime.redrawRequested = false;
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

		// console.log(penStrokes)
		function drawStrokes() {
			if (fast_pen_rendering) {
				ctx.putImageData(penBuffer, 0, 0);
				return;
			}
			ctx.lineCap = 'butt';
			for (const stroke of penStrokes) {
				// ctx.globalAlpha = stroke.color[3]
				const style = `rgba(${stroke.color.map((c,i)=>i==3?c:Math.floor(c * 255)).join(', ')})`
				// console.log(stroke.color)
				ctx.beginPath()
				// console.log(stroke.from[0] + (width / 2), stroke.from[1] + (height / 2))
				ctx.moveTo(stroke.from[0] + (width / 2), -stroke.from[1] + (height / 2))
				ctx.lineTo(stroke.to[0] + (width / 2), -stroke.to[1] + (height / 2))
				// ctx.lineTo(stroke.from[0] + (width / 2), -stroke.from[1] + (height / 2))
				ctx.lineWidth = stroke.width;
				ctx.strokeStyle = style
				ctx.closePath()
				ctx.stroke()
				ctx.beginPath()
				ctx.fillStyle = style
				// console.log(stroke)
				ctx.lineWidth = 0;
				ctx.arc(stroke.from[0] + (width / 2), -stroke.from[1] + (height / 2),
					stroke.width / 2,
					0,
					360);
				ctx.fill();
				ctx.closePath()
				ctx.stroke()
				// ctx.globalAlpha = 1
			}
		}

		/** @type {Target[]} */
		const sprites = Scratch.vm.runtime.targets//.filter(target => !target.isStage)
			.sort((a, b) => a.drawableID - b.drawableID);

		// sprites.forEach(sprite => {
		for (const sprite of sprites) {
			if (sprite.isStage) {
				// console.log('stage')
				drawStrokes();
				continue;
			}
			// console.log(sprite);
			// return;
			if (!sprite.visible) continue;
			let x = canvas.width / 2 + sprite.x;
			let y = canvas.height / 2 - sprite.y;
			const size = sprite.size;
			const angle = (90 - sprite.direction) * (Math.PI / 180);

			const costume = sprite.getCurrentCostume()
			const costumeURI = costume.asset.encodeDataURI();
			let scale = size / 100;
			if (!costumeURI) continue;
			// x -= costume.rotationCenterX * scale;
			// y -= costume.rotationCenterY * scale;
			// console.log(costumeURI)
			if (!costumeCache[costumeURI]) {
				// console.log('loading', costumeURI)
				costumeCache[costumeURI] = {
					loaded: false,
				};
				loadImage(costumeURI).then(i => {
					costumeCache[costumeURI].image = i;
					costumeCache[costumeURI].loaded = true;
					// console.log('loaded', costumeURI, costumeCache)
				});
				continue;
			}
			if (!costumeCache[costumeURI].loaded)
				continue;
			const img = costumeCache[costumeURI].image //new Image();
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
		while (Date.now() < (last + (1000 / vm.runtime.frameLoop.framerate))) {}
		last = Date.now()
		vm.runtime.redrawRequested = false;
		// console.log('frame')
		// return;
		// tref = requestAnimationFrame(drawSprites);
	}
}
else vm.greenFlag();
// requestAnimationFrame(drawSprites);
