// import sdl from 'node-sdl';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import VM from "./scratch-vm/src/virtual-machine.js";
import fs from 'node:fs'
import decompress from 'decompress'
import scratchStorage, { AssetType } from 'scratch-storage';
import path from 'node:path/posix'

const storage = new scratchStorage.ScratchStorage();


var getAssetUrl = function (asset) {
    var assetUrlParts = [
        `file://${path.resolve('.', 'temp-project/')}/`,
        asset.assetId,
        '.',
        asset.dataFormat,
        // '/get/'
    ];
    return assetUrlParts.join('');
};
storage.addWebStore([AssetType.ImageVector, AssetType.ImageBitmap, AssetType.Sound],
	getAssetUrl)

vm.attachStorage(storage)

const vm = new VM();
await decompress('Project.sb3', 'temp-project', {})
const projectJSON = fs.readFileSync('./temp-project/project.json');
console.log(projectJSON)
await vm.loadProject(projectJSON)

vm.runtime.frameLoop.start()

const canvas = createCanvas(480, 360)
// if (targetDiv) {
//     canvas.id = 'scratchCanvas';
//     canvas.width = Scratch.vm.runtime.stageWidth;
//     canvas.height = Scratch.vm.runtime.stageHeight;
//     canvas.style.border = '1px solid black';

//     targetDiv.parentNode.insertBefore(canvas, targetDiv.nextSibling);
// }

const fps = vm?.runtime?.frameLoop?.framerate ?? 30; //TODO - get this from runtime somehow
var delay = 1000 / fps,								 // calc. time per frame
	time = null,									 // start time
	frame = -1,										 // frame count
	tref;											 // rAF time reference


const ctx = canvas.getContext('2d');
function drawSprites(timestamp) {
	// const canvas = document.getElementById('scratchCanvas');
	// if (!canvas) return;
	if (time === null) time = timestamp;              // init start time
	var seg = Math.floor((timestamp - time) / delay); // calc frame no.
	// console.log(seg, frame, seg > frame)
	if (seg > frame) {                                // moved to next frame?
		frame = seg;                                  // update
	} else return tref = requestAnimationFrame(drawSprites);;
    canvas.style.border = '0.0625rem solid var(--ui-black-transparent)';
    canvas.style.backgroundColor = 'white';
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sprites = Scratch.vm.runtime.targets.filter(target => !target.isStage)
        .sort((a, b) => a.drawableID - b.drawableID);

    sprites.forEach(sprite => {
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
        const img = new Image();
        img.src = costumeURI;
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

		ctx.drawImage(img, -costume.rotationCenterX * scale, -costume.rotationCenterY * scale, width, height);

		ctx.restore();

    });

    tref = requestAnimationFrame(drawSprites);
}

// requestAnimationFrame(drawSprites);
