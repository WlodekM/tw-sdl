class WebGLnt {
    getInfo() {
        return {
            id: 'webglnt',
            name: "WebGLn’t Loader",
            blocks: [
                {
                    blockType: 'label',
                    text: "WebGL Modal removed!"
                },
                {
                    opcode: "hasWebgl",
                    blockType: Scratch.BlockType.BOOLEAN,
                    text: "has WebGL?",
                    hideFromPalette: false,
                },
                {
                    opcode: "noWebgl",
                    blockType: Scratch.BlockType.COMMAND,
                    text: "save WebGL loader",
                    hideFromPalette: true,
                }
            ]
        };
    }

    hasWebgl() {
        try {
            const canvas = document.createElement("canvas");
            return !!window.WebGLRenderingContext && !!canvas.getContext("webgl");
        } catch (e) {
            return false;
        }
    }
}

Scratch.extensions.register(new WebGLnt());

function removeElement(selector) {
    const element = document.querySelector(selector);
    return element && (element.outerHTML = '', true);
}

const selectors = ['.ReactModal__Overlay.ReactModal__Overlay--after-open.browser-modal_modal-overlay_3TDyF'];
selectors.forEach(selector => {
    const interval = setInterval(() => {
        removeElement(selector) && clearInterval(interval);
    }, 100);
});

const targetDiv = document.querySelector('.stage-wrapper_stage-wrapper_2bejr.stage-wrapper_offset-controls_1TSoY.box_box_2jjDp');

if (targetDiv) {
    const canvas = document.createElement('canvas');
    canvas.id = 'scratchCanvas';
    canvas.width = Scratch.vm.runtime.stageWidth;
    canvas.height = Scratch.vm.runtime.stageHeight;
    canvas.style.border = '1px solid black';

    targetDiv.parentNode.insertBefore(canvas, targetDiv.nextSibling);
}

const fps = vm.runtime.frameLoop.framerate; //TODO - get this from runtime somehow
var delay = 1000 / fps,                               // calc. time per frame
	time = null,                                      // start time
	frame = -1,                                       // frame count
	tref;                                             // rAF time reference


function drawSprites(timestamp) {
	const canvas = document.getElementById('scratchCanvas');
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
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

requestAnimationFrame(drawSprites);