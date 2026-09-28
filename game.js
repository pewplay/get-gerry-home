(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // globals.ts
  var floor = Math.floor;
  var state = {
    lastFrame: 0,
    delta: 0
  };
  var clock = {
    offset: 0,
    pausedAt: 0
  };
  function now() {
    return (clock.pausedAt || Date.now()) - clock.offset;
  }
  function pauseClock() {
    if (!clock.pausedAt) {
      clock.pausedAt = Date.now();
    }
  }
  function resumeClock() {
    if (clock.pausedAt) {
      clock.offset += Date.now() - clock.pausedAt;
      clock.pausedAt = 0;
    }
  }

  // random.ts
  var seed = Math.floor(Math.random() * 1e4);
  function random(min, max) {
    const x = Math.sin(seed++) * 1e4;
    return floor((x - floor(x)) * (max - min) + min);
  }
  function randomPop(list) {
    return list.splice(random(0, list.length), 1)[0];
  }

  // config.ts
  var config_default = {
    INITIAL_PLAYER_SPEED: 1.2,
    TRANSITION: 350,
    RENDER_AOE: 4,
    MAX_TOUCH_DISTANCE: 150,
    TIME_DILATION: 1,
    CAMERA_SCALE: 12,
    MINIMAP_DURATION: 15e3,
    SHIELD_DURATION: 1e4
  };

  // lib.ts
  function setMatrix(x, y, scale = 1, angle = 0) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([
      c * scale,
      s * scale,
      0,
      0,
      -s * scale,
      c * scale,
      0,
      0,
      0,
      0,
      1,
      0,
      x,
      y,
      0,
      1
    ]);
  }
  function normalize(vector) {
    const [x, y] = vector;
    const length = Math.sqrt(x * x + y * y);
    return [x / length, y / length];
  }

  // math.ts
  var Vec2 = class _Vec2 {
    constructor(x = 0, y = 0) {
      __publicField(this, "x", x);
      __publicField(this, "y", y);
    }
    clone() {
      return new _Vec2(this.x, this.y);
    }
    subtract(rhs) {
      if (rhs instanceof _Vec2) {
        return new _Vec2(this.x - rhs.x, this.y - rhs.y);
      } else {
        return new _Vec2(this.x - rhs, this.y - rhs);
      }
    }
    add(rhs) {
      if (rhs instanceof _Vec2) {
        return new _Vec2(this.x + rhs.x, this.y + rhs.y);
      } else {
        return new _Vec2(this.x + rhs, this.y + rhs);
      }
    }
    multiply(rhs) {
      if (rhs instanceof _Vec2) {
        return new _Vec2(this.x * rhs.x, this.y * rhs.y);
      } else {
        return new _Vec2(this.x * rhs, this.y * rhs);
      }
    }
    dist2(rhs) {
      const diff = rhs ? this.subtract(rhs) : this;
      return diff.x * diff.x + diff.y * diff.y;
    }
    dist(rhs) {
      return Math.sqrt(this.dist2(rhs));
    }
    normalize() {
      const length = this.dist();
      return new _Vec2(this.x / length, this.y / length);
    }
  };

  // node.ts
  var Node = class {
    constructor(x, y) {
      __publicField(this, "untouched", []);
      __publicField(this, "children", []);
      __publicField(this, "touched", false);
      __publicField(this, "position");
      // position: number[];
      __publicField(this, "distance", 0);
      __publicField(this, "time", 0);
      this.position = new Vec2(x, y);
    }
    passable(vec, radius = 0) {
      vec = vec.clone();
      if (vec.x % 1 < 0.5) {
        vec.x -= radius;
      } else {
        vec.x += radius;
      }
      if (vec.y % 1 < 0.5) {
        vec.y -= radius;
      } else {
        vec.y += radius;
      }
      vec.x = Math.floor(vec.x);
      vec.y = Math.floor(vec.y);
      if (this.position.x === vec.x && this.position.y === vec.y) {
        return true;
      }
      for (const child of this.children) {
        if (child.position.x === Math.floor(vec.x) && child.position.y === Math.floor(vec.y)) {
          return true;
        }
      }
      return false;
    }
    draw(game2) {
      const { x, y } = this.position;
      const renderer2 = game2.renderer;
      const gl2 = renderer2.gl;
      renderer2.modelMat = setMatrix(x, y);
      renderer2.setMatrices();
      const isPlayerSpace = Math.floor(game2.player.position.x) === x && Math.floor(game2.player.position.y) === y;
      gl2.uniform1i(game2.mazeShaders.playerSpace, isPlayerSpace ? 1 : 0);
      gl2.uniform1i(
        game2.mazeShaders.squareState,
        this === game2.start ? 0 : this === game2.end ? 1 : this.touched ? 2 : 3
      );
      let t = !this.time ? 0 : (now() - this.time) / config_default.TRANSITION;
      if (t > 1) {
        t = 1;
      }
      gl2.uniform1f(game2.mazeShaders.t, t);
      const pulse = now() / 1e3 % 1;
      gl2.uniform1f(game2.mazeShaders.pulse, pulse);
      gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    }
  };

  // grid.ts
  var Grid = class {
    constructor(width, height) {
      __publicField(this, "width", width);
      __publicField(this, "height", height);
      __publicField(this, "nodes", {});
    }
    get(vec) {
      vec = vec.clone();
      vec.x = Math.floor(vec.x);
      vec.y = Math.floor(vec.y);
      const coord = [vec.x, vec.y].toString();
      if (vec.x >= this.width || vec.y >= this.height || vec.x < 0 || vec.y < 0) {
        return null;
      }
      let node = this.nodes[coord];
      if (!node) {
        node = this.nodes[coord] = new Node(vec.x, vec.y);
      }
      return node;
    }
    draw(game2, isMinimap) {
      game2.mazeShaders.use();
      const renderer2 = game2.renderer;
      const gl2 = renderer2.gl;
      gl2.bindBuffer(gl2.ARRAY_BUFFER, renderer2.squareBuffer);
      gl2.vertexAttribPointer(
        game2.mazeShaders.vertPos,
        2,
        gl2.FLOAT,
        false,
        0,
        0
      );
      gl2.uniform1i(game2.mazeShaders.isMinimap, isMinimap ? 1 : 0);
      for (const key in this.nodes) {
        const node = this.nodes[key];
        node.draw(game2);
      }
    }
  };
  var ADJACENT = [new Vec2(-1, 0), new Vec2(1, 0), new Vec2(0, -1), new Vec2(0, 1)];
  function grid_default(width, height) {
    const grid = new Grid(width, height);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const nodePosition = new Vec2(x, y);
        const node = grid.get(nodePosition);
        for (const offset of ADJACENT) {
          const sibling = grid.get(nodePosition.add(offset));
          if (sibling) {
            node.untouched.push(sibling);
          }
        }
      }
    }
    const start = grid.get(new Vec2(random(0, width), random(0, height)));
    const open = [start];
    let end = start;
    while (open.length) {
      const node = open[0];
      node.touched = true;
      if (!node.untouched.length) {
        open.shift();
        continue;
      }
      const sibling = randomPop(node.untouched);
      if (sibling.touched) {
        continue;
      }
      sibling.untouched.splice(sibling.untouched.indexOf(node), 1);
      sibling.children.push(node);
      sibling.distance = node.distance + 1;
      if (sibling.distance > end.distance) {
        end = sibling;
      }
      node.children.push(sibling);
      sibling.touched = true;
      open.splice(0, 0, sibling);
    }
    return [grid, start, end];
  }

  // shader.ts
  function buildShader(gl2, isFragShader, shaderContents) {
    const shader = gl2.createShader(
      isFragShader ? gl2.FRAGMENT_SHADER : gl2.VERTEX_SHADER
    );
    gl2.shaderSource(shader, shaderContents);
    gl2.compileShader(shader);
    if (!gl2.getShaderParameter(shader, gl2.COMPILE_STATUS)) {
      throw gl2.getShaderInfoLog(shader);
    }
    return shader;
  }

  // shaders/shaders.ts
  var vertexHeader = `precision mediump float;

attribute vec2 vertPos;

uniform mat4 modelMat;
uniform mat4 viewMat;
uniform mat4 projMat;

varying vec2 squarePos;
`;
  var common = `precision mediump float;

uniform int squareState;
uniform int isMinimap;
uniform int playerSpace;
uniform float t;
uniform float pulse;
uniform float fade;
uniform float shield;
uniform float hp;

varying vec2 squarePos;

float circularIn(float t) {
    return 1.0 - t * t;
}

float softEdge(float t, float buffer) {
    float r = t < 1.0 - 2.0 * buffer ? 1.0 : t > 1.0 ? 0.0 : 1.0 - (t - (1.0 - 2.0 * buffer)) / 0.1;
    return r * r;
}

// rgb(219, 68, 55)
const vec3 ENEMY_COLOR = vec3(219. / 255., 68. / 255., 55. / 255.);

// Flickering of the flashlight over time.
float waver(float t) {
    return (1.0 + 0.2 * sin(0.005 * t) + 0.05 * sin(0.8 * t) + 1.2 * sin(0.024 * t) + 0.8 * sin(0.1 * t)) / 10.0;
}

const float FLASHLIGHT_SCALE = 8.0;
`;
  var dropShadowFrag = `${common}
void main() {
    gl_FragColor = vec4(0, 0, 0, 1.0 - fade);
}
`;
  var vertex = `${vertexHeader}
void main() {
    gl_Position = projMat * viewMat * modelMat * vec4(vertPos, 0, 1);
    squarePos = vertPos;
}
`;
  var playerShieldFrag = `${common}
void main() {
    vec2 offset = squarePos - 0.5;

    float dist = distance(offset, vec2(0, 0));

    float alpha = softEdge(distance(vec2(0, 0), offset) * 2.0, 0.05);

    float mixVal = circularIn((dist - 0.8) / 0.5);
    mixVal = mixVal < 0.0 ? 0.0 : mixVal;

    vec4 color = mix(vec4(0, 0, 0, 0), vec4(0, 1, 1, 1), mixVal);

    color.a = color.a < alpha ? color.a : alpha;

    gl_FragColor = color;
}
`;
  var playerFrag = `${common}
void main() {
    vec2 offset = squarePos - 0.5;

    float alpha = softEdge(distance(vec2(0, 0), offset) * 2.0, 0.05);
    vec4 color = mix(vec4(1, 0, 0, 1), vec4(0, 1, 0, 1), hp);

    color.a = alpha;

    gl_FragColor = color;
}
`;
  var enemyFrag = `${common}
void main() {
    vec2 offset = squarePos - 0.5;

    float alpha = softEdge(distance(vec2(0, 0), offset) * 2.0, 0.05);

    gl_FragColor = vec4(ENEMY_COLOR, alpha);
}
`;
  var proximityFrag = `${common}
void main() {
    vec2 offset = squarePos - 0.5;

    float dist = distance(vec2(0, 0), offset) * 2.0;

    float alpha = softEdge(dist, 0.02);

    if (dist < 0.25) {
        gl_FragColor = vec4(ENEMY_COLOR, alpha);
    } else {
        gl_FragColor = vec4(0.3, 0.3, 0.6, alpha);
    }
}
`;
  var explosionFrag = `${common}
void main() {
    vec2 offset = squarePos - 0.5;

    float alpha = softEdge(distance(vec2(0, 0), offset) * 2.0, 0.02);

    gl_FragColor = vec4(0.8, 0, 0, alpha);
}
`;
  var shadowFrag = `${common}
void main() {
    const float alpha = 1.0;
    gl_FragColor = mix(vec4(0, 0, 0, alpha), vec4(1, 1, 1, alpha), hp > 1.0 ? (hp - 1.0) * 2.0 : 0.0);
}
`;
  var bulletFrag = `${common}
void main() {
    vec2 offset = squarePos - 0.5;

    float dist = distance(vec2(0, 0), offset) * 2.0;

    float alpha = softEdge(dist, 0.05) * 2.0;

    float blue = (atan(offset.y / offset.x) + 1.0) / (2.0);

    gl_FragColor = mix(vec4(1, 0, 0, alpha), vec4(0.6, 0.0, 0.0, alpha), blue);
}
`;
  var indicatorFrag = `${common}
void main() {
    vec2 offset = squarePos - 0.5;

    float alpha = softEdge(distance(vec2(0, 0), offset) * 2.0, 0.05);

    gl_FragColor = vec4(0, 0.75, 0.75, alpha * 0.85 * t);
}
`;
  var flashlightFrag = `${common}
void main() {
    // The quad is FLASHLIGHT_SCALE times larger than the light itself so the
    // darkness also covers the extra area visible on wide or tall screens.
    vec2 offset = (squarePos - 0.5) * FLASHLIGHT_SCALE;

    float alpha = 1.0 - circularIn(distance(vec2(0, 0), offset / (0.55 * hp)));

    alpha += waver(t);

    float mixVal = hp > 1.0 ? (hp - 1.0) * 2.0 : 0.0;

    gl_FragColor = mix(vec4(0, 0, 0, alpha), vec4(1, 1, 1, 1), mixVal);
}
`;
  var shieldFrag = `${common}
void main() {
    vec2 center = squarePos - 0.5;

    float intensity = distance(vec2(0, 0), center) * 2.1;

    vec2 offset = (squarePos - vec2(0.5, 0.8));
    offset.x *= 23.0;
    offset.y *= -36.0;


    bool on = false;

    if (offset.x > -7.0 && offset.x < 7.0 && offset.y > offset.x * offset.x / 2.5) {
        if (offset.x < -3.5) {
            on = offset.y < pow(offset.x + 3.5, 2.0) / 6.0 + 17.5;
        } else if (offset.x < 0.0) {
            on = offset.y < pow(offset.x + 3.5, 2.0) / 1.7 + 17.5;
        } else if (offset.x < 3.5) {
            on = offset.y < pow(offset.x - 3.5, 2.0) / 1.7 + 17.5;
        } else {
            on = offset.y < pow(offset.x - 3.5, 2.0) / 6.0 + 17.5;
        }
    }

    gl_FragColor = on ? mix(vec4(0, 1, 1, 1.0 - fade), vec4(0, 0.0, 0.0, 1.0 - fade), 1.0 - circularIn(intensity + fade)) : vec4(0, 0, 0, 0);
}
`;
  var hallFrag = `${common}
void main() {
    vec4 wall = vec4(0, 0, 0, fade);
    vec4 hall = vec4(1, 1, 1, fade);


    if (squareState == 0) {

        if (isMinimap == 1) {
            hall = vec4(1, 0, 0, 1);
        } else if (mod((squarePos.x - squarePos.y) * 10.0, 2.0) > 1.0) {
            hall = vec4(1, 1, 0, 1);
        } else {
            hall = vec4(0.2, 0.2, 0.2, 1);
        }
    } else if (squareState == 1) {
        if (isMinimap == 1) {
            hall = vec4(0, 1, 0, 1);
        } else if ((mod(squarePos.x * 10.0, 2.0) > 1.0 && mod(squarePos.y * 10.0, 2.0) > 1.0) || (mod(squarePos.x * 10.0, 2.0) < 1.0 && mod(squarePos.y * 10.0, 2.0) < 1.0)) {
            hall = vec4(1, 1, 1, 1);
        } else {
            hall = vec4(0, 0, 0, 1);
        }
    } else if (squareState == 2) {
        hall = vec4(0.5, 0.5, 0.5, 1);
    }

    vec4 color = mix(vec4(0.5, 0.5, 0.5, 1), hall, 1.0 - circularIn(squareState < 2 ? 1.0 : t));

    if (isMinimap == 1 && playerSpace == 1) {
        float mixValue = pulse < 0.5 ? pulse / 0.5 : 1.0 - ((pulse - 0.5) / 0.5);
        color = mix(color, vec4(0.5, 0.5, 0.5, 1), mixValue);
    }
    color.a = 1.0 - fade;
    gl_FragColor = color;
}
`;
  var FLASHLIGHT_SCALE = 8;
  var UniformRenaming = {
    fade: "fade",
    modelMat: "modelMat",
    viewMat: "viewMat",
    projMat: "projMat",
    hp: "hp",
    t: "t",
    squareState: "squareState",
    isMinimap: "isMinimap",
    playerSpace: "playerSpace",
    pulse: "pulse"
  };
  var AttributeRenaming = { vertPos: "vertPos" };

  // renderer.ts
  var gl;
  var Program = class {
    constructor(renderer2, ...shaders) {
      __publicField(this, "renderer", renderer2);
      __publicField(this, "shaderProgram");
      const prog = this.shaderProgram = gl.createProgram();
      for (let i = 0; i < 2; i += 1) {
        gl.attachShader(prog, buildShader(gl, i, shaders[i]));
      }
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("Could not link shaders....");
      }
      this.use();
      for (const key in UniformRenaming) {
        this[key] = gl.getUniformLocation(
          prog,
          UniformRenaming[key]
        );
      }
      for (const key in AttributeRenaming) {
        this[key] = gl.getAttribLocation(
          prog,
          AttributeRenaming[key]
        );
        gl.enableVertexAttribArray(this[key]);
      }
    }
    use() {
      this.renderer.use(this);
    }
  };
  var Renderer = class {
    constructor() {
      __publicField(this, "currentProgram");
      __publicField(this, "gl");
      __publicField(this, "modelMat");
      __publicField(this, "projMat");
      __publicField(this, "camera", setMatrix(-8, -8, 0.85, 0));
      __publicField(this, "squareBuffer");
      /** Half extents of the visible area in projection units (the short side is always 10). */
      __publicField(this, "viewHalfWidth", 10);
      __publicField(this, "viewHalfHeight", 10);
      __publicField(this, "canvas");
      const canvas = this.canvas = document.querySelector(
        "canvas"
      );
      gl = this.gl = canvas.getContext("webgl", {
        antialias: true,
        alpha: false
      });
      if (!gl) {
        throw new Error(`WebGL couldn't be initialized`);
      }
      this.resize();
      gl.clearColor(0, 0, 0, 1);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
      this.squareBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.squareBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        // prettier-ignore
        new Float32Array([
          0,
          0,
          0,
          1,
          1,
          0,
          1,
          1
        ]),
        gl.STATIC_DRAW
      );
    }
    /**
     * Fit the drawing buffer to the canvas' CSS size (times devicePixelRatio)
     * and build a projection that keeps square proportions: the shorter side
     * of the screen always spans 20 units and the longer side shows more of
     * the maze instead of stretching it.
     */
    resize() {
      const canvas = this.canvas;
      const cssWidth = Math.max(1, canvas.clientWidth || innerWidth);
      const cssHeight = Math.max(1, canvas.clientHeight || innerHeight);
      const dpr = Math.max(
        1,
        Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(3e6 / (cssWidth * cssHeight))
        )
      );
      const width = Math.round(cssWidth * dpr);
      const height = Math.round(cssHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const shortSide = Math.min(cssWidth, cssHeight);
      this.viewHalfWidth = 10 * cssWidth / shortSide;
      this.viewHalfHeight = 10 * cssHeight / shortSide;
      const left = -this.viewHalfWidth;
      const right = this.viewHalfWidth;
      const bottom = this.viewHalfHeight;
      const top = -this.viewHalfHeight;
      const lr = 1 / (left - right);
      const bt = 1 / (bottom - top);
      const nf = 1 / (-80 - 80);
      this.projMat = new Float32Array([
        -2 * lr,
        0,
        0,
        0,
        0,
        -2 * bt,
        0,
        0,
        0,
        0,
        2 * nf,
        0,
        (left + right) * lr,
        (top + bottom) * bt,
        0,
        1
      ]);
      gl.viewport(0, 0, width, height);
    }
    use(program) {
      if (this.currentProgram !== program) {
        this.currentProgram = program;
        gl.useProgram(program.shaderProgram);
      }
    }
    setMatrices() {
      gl.uniformMatrix4fv(this.currentProgram.viewMat, false, this.camera);
      gl.uniformMatrix4fv(this.currentProgram.modelMat, false, this.modelMat);
      gl.uniformMatrix4fv(this.currentProgram.projMat, false, this.projMat);
    }
  };

  // progression.ts
  function lerp(start, end, t) {
    return start + t * (end - start);
  }
  function logarithmicProgression(t) {
    return Math.floor(Math.log2(t + 1) * 4 + 2);
  }

  // entity.ts
  var Bullet = class {
    constructor(x, y) {
      __publicField(this, "position");
      __publicField(this, "vector");
      __publicField(this, "bulletScale", 0.05);
      __publicField(this, "bulletSpeed", 0.9);
      this.position = new Vec2(x, y);
    }
    draw(game2) {
      const renderer2 = game2.renderer;
      const gl2 = renderer2.gl;
      game2.bulletShaders.use();
      renderer2.modelMat = setMatrix(
        this.position.x - this.bulletScale / 2,
        this.position.y - this.bulletScale / 2,
        this.bulletScale
      );
      renderer2.setMatrices();
      gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    }
    simulate(game2) {
      const next = this.position.add(
        this.vector.multiply(this.bulletSpeed * state.delta)
      );
      const current = game2.grid.get(this.position);
      const nextNode = game2.grid.get(next);
      const player = game2.player;
      if (nextNode && nextNode !== game2.start && nextNode !== game2.end && current.passable(next, this.bulletScale / 2)) {
        const { x, y } = player.position;
        if (current.passable(player.position) && game2.grid.get(player.position) !== game2.start) {
          if (next.dist(player.position) < (player.playerScale + this.bulletScale) / 2) {
            player.attack(0.07);
            return false;
          }
        }
        this.position = next;
        return true;
      }
      return false;
    }
  };
  var Enemy = class {
    constructor(x, y, level, distance) {
      __publicField(this, "level", level);
      __publicField(this, "distance", distance);
      __publicField(this, "position");
      this.position = new Vec2(x, y);
    }
  };
  var Item = class {
    constructor(x, y) {
      __publicField(this, "position");
      this.position = new Vec2(x, y);
    }
  };
  var Shield = class extends Item {
    constructor(x, y) {
      super(x + 0.5, y + 0.5);
      __publicField(this, "shieldScale", 0.5);
      __publicField(this, "grabbed");
      __publicField(this, "fade", 0);
    }
    draw(game2) {
      const renderer2 = game2.renderer;
      const gl2 = renderer2.gl;
      game2.shieldProgram.use();
      gl2.uniform1f(game2.shieldProgram.fade, this.fade);
      renderer2.modelMat = setMatrix(
        this.position.x - this.shieldScale / 2,
        this.position.y - this.shieldScale / 2,
        this.shieldScale
      );
      renderer2.setMatrices();
      gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    }
    simulate(game2) {
      const { player } = game2;
      if (this.grabbed) {
        this.fade = (now() - this.grabbed) * config_default.TIME_DILATION / 300;
        if (this.fade > 1) {
          return false;
        }
      } else if (player.position.dist2(this.position) < 0.05) {
        this.grabbed = now();
        game2.player.shield = now();
      }
      return true;
    }
  };
  var MiniMap = class extends Item {
    constructor(x, y) {
      super(x + 0.5, y + 0.5);
      __publicField(this, "grabbed");
      __publicField(this, "fade", 0);
    }
    draw(game2) {
      const minimapScale = 1 / game2.grid.height;
      const renderer2 = game2.renderer;
      const gl2 = renderer2.gl;
      const time = now();
      const c = Math.cos(time / 1e3 % Math.PI * 2);
      const s = Math.sin(time / 1e3 % Math.PI * 2);
      const oldCam = game2.renderer.camera;
      const scale = config_default.CAMERA_SCALE;
      const r1 = c * minimapScale;
      const r2 = s * minimapScale;
      const drawPos = this.position.subtract(game2.player.position);
      renderer2.camera = new Float32Array([
        r1,
        r2,
        0,
        0,
        -r2,
        r1,
        0,
        0,
        0,
        0,
        1,
        0,
        scale * (drawPos.x - 0.1 * (r1 + r2)),
        scale * (drawPos.y - 0.2 * (r1 - r2)),
        1,
        1
        // -(game.player.x * scale) + this.x * scale, -(game.player.y * scale) + this.y * scale, 1, 1
      ]);
      game2.dropShadowShaders.use();
      gl2.uniform1f(game2.dropShadowShaders.fade, this.fade);
      renderer2.modelMat = setMatrix(
        -0.1 / minimapScale,
        -0.1 / minimapScale,
        game2.grid.height * 1.2
      );
      renderer2.setMatrices();
      gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
      game2.mazeShaders.use();
      gl2.uniform1f(game2.mazeShaders.fade, this.fade);
      game2.grid.draw(game2, true);
      gl2.uniform1f(game2.mazeShaders.fade, 0);
      game2.renderer.camera = oldCam;
    }
    simulate(game2) {
      const { player } = game2;
      if (this.grabbed) {
        this.fade = (now() - this.grabbed) * config_default.TIME_DILATION / 300;
        if (this.fade > 1) {
          return false;
        }
      } else if (player.position.dist2(this.position) < 0.05) {
        this.grabbed = now();
        game2.minimapActivated = now();
      }
      return true;
    }
  };
  var ProximityMine = class extends Enemy {
    constructor(x, y, level, distance) {
      super(x, y, level, distance);
      __publicField(this, "maxEnemyScale", 0.2);
      __publicField(this, "maxExplosionScale", 0.7);
      __publicField(this, "enemyScale");
      __publicField(this, "explosionScale", 0);
      __publicField(this, "currentSpeed", 0);
      __publicField(this, "chaseTime", 2500);
      __publicField(this, "accelTime", 600);
      __publicField(this, "explodeTime", 500);
      __publicField(this, "maxSpeed");
      __publicField(this, "startTime");
      __publicField(this, "spent", false);
      this.enemyScale = this.maxEnemyScale;
      this.maxSpeed = config_default.INITIAL_PLAYER_SPEED * 0.8;
    }
    draw(game2) {
      const renderer2 = game2.renderer;
      const gl2 = renderer2.gl;
      game2.proximityProgram.use();
      renderer2.modelMat = setMatrix(
        this.position.x - this.enemyScale / 2,
        this.position.y - this.enemyScale / 2,
        this.enemyScale
      );
      renderer2.setMatrices();
      gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
      game2.explosionProgram.use();
      renderer2.modelMat = setMatrix(
        this.position.x - this.explosionScale / 2,
        this.position.y - this.explosionScale / 2,
        this.explosionScale
      );
      renderer2.setMatrices();
      gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    }
    simulate(game2) {
      const currentNode = game2.grid.get(this.position);
      const player = game2.player;
      const { x, y } = player.position;
      const fullVec = player.position.subtract(this.position);
      const normalVec = fullVec.normalize();
      const dist = fullVec.dist2();
      const lineOfSight = currentNode.passable(player.position);
      if (!this.startTime && dist < 0.5 && lineOfSight) {
        this.startTime = now();
      } else if (this.startTime) {
        let delta = (now() - this.startTime) * config_default.TIME_DILATION;
        if (delta < this.chaseTime) {
          if (dist > 1e-3 && lineOfSight) {
            const t = (now() - this.startTime) / this.accelTime;
            const speed = lerp(0, this.maxSpeed, t > 1 ? 1 : t);
            this.position = this.position.add(
              normalVec.multiply(speed * state.delta)
            );
          }
        } else if (delta < this.chaseTime + this.explodeTime) {
          delta -= this.chaseTime;
          let percentDone;
          if (delta > this.explodeTime / 2) {
            percentDone = 2 - 2 * delta / this.explodeTime;
            this.enemyScale = this.maxEnemyScale * percentDone;
          } else {
            percentDone = 2 * delta / this.explodeTime;
          }
          this.explosionScale = this.maxExplosionScale * percentDone;
          const explosionDist = Math.pow(
            (this.explosionScale + player.playerScale) / 2,
            2
          );
          for (const enemy of game2.entities) {
            if (enemy instanceof Shooter) {
              const enemyVector = this.position.subtract(
                enemy.position
              );
              const enemyDist = enemyVector.dist2();
              if (enemyDist < Math.pow(
                (this.explosionScale + enemy.enemyScale) / 2,
                2
              )) {
                enemy.dying = true;
              }
            }
          }
          if (!this.spent && dist < explosionDist) {
            player.attack(0.25);
            this.spent = true;
          }
        } else {
          return false;
        }
      }
      return true;
    }
  };
  var Shooter = class extends Enemy {
    constructor(x, y, level, distance) {
      super(x, y, level, distance);
      __publicField(this, "maxEnemyScale", 0.13);
      __publicField(this, "enemyScale");
      __publicField(this, "prevShotTime", now());
      __publicField(this, "dying", false);
      __publicField(this, "dieStart");
      __publicField(this, "clipSize");
      __publicField(this, "roundsPerSecond");
      __publicField(this, "coolDown");
      __publicField(this, "currentClip", 0);
      this.clipSize = Math.floor(Math.log((level + 2) * 1.9));
      this.roundsPerSecond = Math.floor(Math.log(level + 2) * 3.5);
      this.coolDown = 1e3;
      this.enemyScale = this.maxEnemyScale;
    }
    draw(game2) {
      const renderer2 = game2.renderer;
      const gl2 = renderer2.gl;
      game2.shooterProgram.use();
      renderer2.modelMat = setMatrix(
        this.position.x - this.enemyScale / 2,
        this.position.y - this.enemyScale / 2,
        this.enemyScale
      );
      renderer2.setMatrices();
      gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    }
    simulate(game2) {
      if (this.dying) {
        if (!this.dieStart) {
          this.dieStart = now();
        } else {
          const t = (now() - this.dieStart) * config_default.TIME_DILATION;
          this.enemyScale = lerp(this.enemyScale, 0, t);
          if (this.enemyScale <= 0) {
            return false;
          }
        }
        return true;
      }
      const delta = (now() - this.prevShotTime) * config_default.TIME_DILATION;
      if (this.currentClip && delta > 1e3 / this.roundsPerSecond) {
        this.currentClip -= 1;
        this.shoot(game2);
      } else if (this.currentClip === 0 && delta > this.coolDown) {
        this.currentClip = this.clipSize;
      }
      return true;
    }
    shoot(game2) {
      let vector = game2.player.position.subtract(this.position).normalize();
      const bullet = new Bullet(this.position.x, this.position.y);
      bullet.vector = vector;
      game2.pendingEntities.push(bullet);
      this.prevShotTime = now();
    }
  };

  // player.ts
  var PLAYER_SCALE = 0.04;
  var Player = class {
    constructor(game2) {
      __publicField(this, "game", game2);
      __publicField(this, "hp", 0);
      __publicField(this, "speed", config_default.INITIAL_PLAYER_SPEED);
      __publicField(this, "position");
      __publicField(this, "program");
      __publicField(this, "shieldProgram");
      __publicField(this, "actualHP", 1);
      __publicField(this, "playerScale", PLAYER_SCALE);
      __publicField(this, "shield", 0);
      __publicField(this, "lastHitTime", now());
      const renderer2 = game2.renderer;
      this.program = new Program(renderer2, vertex, playerFrag);
      this.shieldProgram = new Program(renderer2, vertex, playerShieldFrag);
    }
    start(x, y) {
      this.position = new Vec2(x + 0.5, y + 0.5);
    }
    setHP(val) {
      this.lastHitTime = now();
      this.actualHP = val;
    }
    attack(damage) {
      if ((now() - this.shield) * config_default.TIME_DILATION < config_default.SHIELD_DURATION) {
        return;
      }
      if (this.game.grid.get(this.position) === this.game.start) {
        return;
      }
      if (Math.abs(this.hp - this.actualHP) < 0.01) {
        this.lastHitTime = now();
      }
      this.actualHP -= damage;
      if (this.actualHP < 0) {
        this.actualHP = 0;
      }
    }
    circularIn(t) {
      return t * t;
    }
    simulate() {
      const t = this.circularIn((now() - this.lastHitTime) / 800);
      this.hp = lerp(this.hp, this.actualHP, t > 1 ? 1 : t < 0 ? 0 : t);
      if (this.hp < 0.15 && this.actualHP < 0.15) {
        this.actualHP = 0;
      }
    }
    draw() {
      const renderer2 = this.game.renderer;
      const gl2 = renderer2.gl;
      const delta = (now() - this.shield) * config_default.TIME_DILATION;
      if (delta < config_default.SHIELD_DURATION) {
        this.shieldProgram.use();
        const FADE_TIME = 400;
        const scalar = delta < FADE_TIME ? delta / FADE_TIME : config_default.SHIELD_DURATION - delta < FADE_TIME ? (config_default.SHIELD_DURATION - delta) / FADE_TIME : 1;
        const scale = PLAYER_SCALE * 2 * scalar;
        renderer2.modelMat = setMatrix(
          this.position.x - scale / 2,
          this.position.y - scale / 2,
          scale
        );
        renderer2.setMatrices();
        gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
      }
      this.program.use();
      gl2.bindBuffer(gl2.ARRAY_BUFFER, renderer2.squareBuffer);
      gl2.vertexAttribPointer(this.program.vertPos, 2, gl2.FLOAT, false, 0, 0);
      renderer2.modelMat = setMatrix(
        this.position.x - PLAYER_SCALE / 2,
        this.position.y - PLAYER_SCALE / 2,
        PLAYER_SCALE
      );
      renderer2.setMatrices();
      gl2.uniform1f(this.program.hp, this.hp);
      gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    }
  };

  // game.ts
  var Game = class {
    constructor(renderer2) {
      __publicField(this, "renderer", renderer2);
      __publicField(this, "grid");
      __publicField(this, "start");
      __publicField(this, "end");
      __publicField(this, "entities");
      __publicField(this, "pendingEntities");
      __publicField(this, "player");
      __publicField(this, "downMap", {});
      __publicField(this, "startTime", now());
      __publicField(this, "minimapActivated", 0);
      __publicField(this, "level", 0);
      __publicField(this, "maxLevel", 0);
      __publicField(this, "shadowBuffer");
      __publicField(this, "shadowCount", 0);
      __publicField(this, "mazeShaders");
      __publicField(this, "bulletShaders");
      __publicField(this, "flashlightShaders");
      __publicField(this, "shadowShaders");
      __publicField(this, "indicatorShaders");
      __publicField(this, "dropShadowShaders");
      __publicField(this, "shooterProgram");
      __publicField(this, "proximityProgram");
      __publicField(this, "explosionProgram");
      __publicField(this, "shieldProgram");
      /** Pointer (mouse / touch) steering: the id of the active pointer and its position. */
      __publicField(this, "pointerId", null);
      __publicField(this, "pointerPos", [0, 0]);
      /** Called when Gerry reaches home (new level) or gets lost (back to level 1). */
      __publicField(this, "onLevelChange", () => {
      });
      __publicField(this, "onLost", () => {
      });
      this.mazeShaders = new Program(renderer2, vertex, hallFrag);
      this.shooterProgram = new Program(renderer2, vertex, enemyFrag);
      this.bulletShaders = new Program(renderer2, vertex, bulletFrag);
      this.proximityProgram = new Program(renderer2, vertex, proximityFrag);
      this.explosionProgram = new Program(renderer2, vertex, explosionFrag);
      this.shadowShaders = new Program(renderer2, vertex, shadowFrag);
      this.flashlightShaders = new Program(renderer2, vertex, flashlightFrag);
      this.indicatorShaders = new Program(renderer2, vertex, indicatorFrag);
      this.dropShadowShaders = new Program(renderer2, vertex, dropShadowFrag);
      this.shieldProgram = new Program(renderer2, vertex, shieldFrag);
      this.player = new Player(this);
      this.buildWorld();
      const keyName = (evt) => {
        switch (evt.code) {
          case "KeyW":
            return "w";
          case "KeyA":
            return "a";
          case "KeyS":
            return "s";
          case "KeyD":
            return "d";
        }
        return evt.key.toLowerCase();
      };
      addEventListener("keydown", (evt) => {
        const key = keyName(evt);
        if (key.startsWith("arrow")) {
          evt.preventDefault();
        }
        this.downMap[key] = 1;
      });
      addEventListener("keyup", (evt) => {
        this.downMap[keyName(evt)] = 0;
      });
      addEventListener("blur", () => this.releaseInput());
      const canvas = renderer2.canvas;
      canvas.addEventListener("pointerdown", (evt) => {
        if (evt.pointerType === "mouse" && evt.button !== 0) {
          return;
        }
        evt.preventDefault();
        this.pointerId = evt.pointerId;
        this.pointerPos = [evt.clientX, evt.clientY];
        try {
          canvas.setPointerCapture(evt.pointerId);
        } catch (e) {
        }
      });
      canvas.addEventListener("pointermove", (evt) => {
        if (evt.pointerId === this.pointerId) {
          this.pointerPos = [evt.clientX, evt.clientY];
        }
      });
      const release = (evt) => {
        if (evt.pointerId === this.pointerId) {
          this.pointerId = null;
        }
      };
      canvas.addEventListener("pointerup", release);
      canvas.addEventListener("pointercancel", release);
      canvas.addEventListener("lostpointercapture", release);
      canvas.addEventListener("contextmenu", (evt) => evt.preventDefault());
    }
    releaseInput() {
      this.downMap = {};
      this.pointerId = null;
    }
    /** Distance (CSS px) from the screen centre that gives full walking speed. */
    maxPointerDistance() {
      const canvas = this.renderer.canvas;
      const shortSide = Math.min(canvas.clientWidth, canvas.clientHeight);
      return Math.max(60, Math.min(config_default.MAX_TOUCH_DISTANCE, shortSide * 0.3));
    }
    /** Start again from the first (2x2) maze. */
    restart() {
      this.level = 0;
      this.player.setHP(1);
      this.player.hp = 0;
      this.player.shield = 0;
      this.buildWorld();
    }
    buildWorld() {
      this.entities = [];
      this.pendingEntities = [];
      this.minimapActivated = 0;
      const size = logarithmicProgression(this.level);
      [this.grid, this.start, this.end] = grid_default(size, size);
      this.onLevelChange(this.level, this.maxLevel);
      const enemyTypes = [ProximityMine, Shooter];
      const itemTypes = [MiniMap, Shield];
      for (const key in this.grid.nodes) {
        const node = this.grid.nodes[key];
        if (node !== this.start && node !== this.end) {
          if (random(0, 25) === 0) {
            const Item2 = itemTypes[random(0, itemTypes.length)];
            this.entities.push(
              new Item2(node.position.x, node.position.y)
            );
          }
          const entityCount = random(0, 2);
          for (let i = 0; i < entityCount; i += 1) {
            const Enemy2 = enemyTypes[random(0, enemyTypes.length)];
            const enemy = new Enemy2(
              node.position.x + 0.2 + Math.random() * 0.6,
              node.position.y + 0.2 + Math.random() * 0.6,
              this.level,
              node.distance
            );
            this.entities.push(enemy);
          }
        }
      }
      this.player.start(this.start.position.x, this.start.position.y);
    }
    processInput() {
      const { player, grid, downMap } = this;
      let { x, y } = player.position;
      const px = x;
      const py = y;
      const current = grid.get(player.position);
      if (this.pointerId === null) {
        if (downMap.arrowup) {
          y -= player.speed * state.delta;
        }
        if (downMap.arrowdown) {
          y += player.speed * state.delta;
        }
        if (downMap.arrowleft) {
          x -= player.speed * state.delta;
        }
        if (downMap.arrowright) {
          x += player.speed * state.delta;
        }
        if (downMap.w) {
          y -= player.speed * state.delta;
        }
        if (downMap.s) {
          y += player.speed * state.delta;
        }
        if (downMap.a) {
          x -= player.speed * state.delta;
        }
        if (downMap.d) {
          x += player.speed * state.delta;
        }
      } else {
        const rect = this.renderer.canvas.getBoundingClientRect();
        let actualVector = [
          this.pointerPos[0] - (rect.left + rect.width / 2),
          this.pointerPos[1] - (rect.top + rect.height / 2)
        ];
        const maxDistance = this.maxPointerDistance();
        const length = Math.sqrt(
          actualVector[0] * actualVector[0] + actualVector[1] * actualVector[1]
        );
        if (length > maxDistance) {
          actualVector = normalize(actualVector);
        } else {
          actualVector = [
            actualVector[0] / maxDistance,
            actualVector[1] / maxDistance
          ];
        }
        x += actualVector[0] * player.speed * state.delta;
        y += actualVector[1] * player.speed * state.delta;
      }
      let xoffset = 0.01;
      let yoffset = xoffset;
      if (px % 1 < 0.5) {
        xoffset *= -1;
      }
      if (py % 1 < 0.5) {
        yoffset *= -1;
      }
      if (current.passable(new Vec2(x + xoffset, py + yoffset))) {
        player.position.x = x;
      }
      if (current.passable(new Vec2(px + xoffset, y + yoffset))) {
        player.position.y = y;
      }
      current.touched = false;
      if (!current.time) {
        current.time = now();
      }
    }
    buildShadows() {
      let points = [];
      const shadowScale = 500;
      for (const key in this.grid.nodes) {
        let buildShadow = function(x2, y2, dx, dy) {
          const ray1 = normalize([x2 - px, y2 - py]);
          const ray2 = normalize([dx - px, dy - py]);
          const p1 = [
            x2 + ray1[0] * shadowScale,
            y2 + ray1[1] * shadowScale
          ];
          const p2 = [
            dx + ray2[0] * shadowScale,
            dy + ray2[1] * shadowScale
          ];
          points = points.concat([x2, y2], p1, [dx, dy], p1, [dx, dy], p2);
        };
        const node = this.grid.nodes[key];
        const { x: nx, y: ny } = node.position;
        const { x: px, y: py } = this.player.position;
        const x = px - nx;
        const y = py - ny;
        if (x * x + y * y < 2 * 2) {
          if (!node.passable(new Vec2(nx, ny - 1))) {
            buildShadow(nx, ny, nx + 1, ny);
          }
          if (!node.passable(new Vec2(nx - 1, ny))) {
            buildShadow(nx, ny, nx, ny + 1);
          }
        }
      }
      const { gl: gl2 } = this.renderer;
      if (this.shadowBuffer) {
        gl2.deleteBuffer(this.shadowBuffer);
      }
      this.shadowBuffer = gl2.createBuffer();
      gl2.bindBuffer(gl2.ARRAY_BUFFER, this.shadowBuffer);
      const floatArray = new Float32Array(points);
      gl2.bufferData(gl2.ARRAY_BUFFER, floatArray, gl2.STREAM_DRAW);
      this.shadowCount = floatArray.length / 2;
    }
    draw() {
      const time = now();
      state.delta = state.lastFrame ? Math.min((time - state.lastFrame) / 1e3, 0.1) * config_default.TIME_DILATION : 0;
      state.lastFrame = time;
      this.processInput();
      const player = this.player;
      const SCALE = config_default.CAMERA_SCALE;
      this.renderer.camera = new Float32Array([
        SCALE,
        0,
        0,
        0,
        0,
        SCALE,
        0,
        0,
        0,
        0,
        1,
        0,
        -SCALE * player.position.x,
        -SCALE * player.position.y,
        1,
        1
      ]);
      this.buildShadows();
      const gl2 = this.renderer.gl;
      this.grid.draw(this, false);
      const removedEntities = [];
      this.entities = this.entities.concat(this.pendingEntities);
      this.pendingEntities = [];
      for (const entity of this.entities) {
        if (Math.abs(player.position.x - entity.position.x) > config_default.RENDER_AOE || Math.abs(player.position.y - entity.position.y) > config_default.RENDER_AOE) {
          continue;
        }
        const alive = entity.simulate(this);
        if (alive) {
          entity.draw(this);
        } else {
          removedEntities.push(entity);
        }
      }
      for (const entity of removedEntities) {
        this.entities.splice(this.entities.indexOf(entity), 1);
      }
      player.simulate();
      player.draw();
      this.flashlightShaders.use();
      this.renderer.modelMat = setMatrix(
        player.position.x - FLASHLIGHT_SCALE,
        player.position.y - FLASHLIGHT_SCALE,
        FLASHLIGHT_SCALE * 2
      );
      this.renderer.setMatrices();
      gl2.uniform1f(this.flashlightShaders.hp, this.player.hp);
      gl2.uniform1f(
        this.flashlightShaders.t,
        (now() - this.startTime) / 100
      );
      gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
      if (this.shadowCount) {
        this.shadowShaders.use();
        gl2.bindBuffer(gl2.ARRAY_BUFFER, this.shadowBuffer);
        gl2.vertexAttribPointer(
          this.mazeShaders.vertPos,
          2,
          gl2.FLOAT,
          false,
          0,
          0
        );
        this.renderer.modelMat = setMatrix(0, 0, 1);
        this.renderer.setMatrices();
        gl2.uniform1f(this.shadowShaders.hp, this.player.hp);
        gl2.drawArrays(gl2.TRIANGLES, 0, this.shadowCount);
      }
      if ((now() - this.minimapActivated) * config_default.TIME_DILATION < config_default.MINIMAP_DURATION) {
        const renderer2 = this.renderer;
        const unitsPerPixel = 2 * renderer2.viewHalfHeight / Math.max(1, renderer2.canvas.clientHeight);
        const shortSide = Math.min(
          renderer2.canvas.clientWidth,
          renderer2.canvas.clientHeight
        );
        const size = Math.max(90, Math.min(180, shortSide * 0.2)) * unitsPerPixel;
        const margin = 12 * unitsPerPixel;
        const top = 64 * unitsPerPixel;
        const minimapScale = size / this.grid.height;
        renderer2.camera = new Float32Array([
          minimapScale,
          0,
          0,
          0,
          0,
          minimapScale,
          0,
          0,
          0,
          0,
          1,
          0,
          renderer2.viewHalfWidth - margin - size,
          -renderer2.viewHalfHeight + top,
          1,
          1
        ]);
        this.grid.draw(this, true);
      }
      if (player.hp < 0.01 && player.actualHP < 1 || player.hp >= 1.5 && player.actualHP > 1.5) {
        const reached = this.level;
        const lost = player.hp <= 1;
        if (lost) {
          this.level = 0;
        } else {
          this.level += 1;
        }
        if (this.level > this.maxLevel) {
          this.maxLevel = this.level;
        }
        player.setHP(1);
        this.buildWorld();
        if (lost) {
          this.onLost(reached);
        }
      }
      const playerNode = this.grid.get(player.position);
      if (playerNode === this.end && player.actualHP < 1.8) {
        player.setHP(1.8);
        this.entities = [];
      }
    }
  };

  // audio/song.ts
  function getPitch(root, n) {
    return root * Math.pow(2, (n - 49) / 12);
  }
  var Channel = class {
    constructor(context, parent, channel, ticksPerBeat, beatsPerMinute, beatsPerBar) {
      __publicField(this, "context", context);
      __publicField(this, "parent", parent);
      __publicField(this, "channel", channel);
      __publicField(this, "ticksPerBeat", ticksPerBeat);
      __publicField(this, "beatsPerMinute", beatsPerMinute);
      __publicField(this, "beatsPerBar", beatsPerBar);
      __publicField(this, "oscillatorPool", []);
      __publicField(this, "gainPool", []);
      __publicField(this, "finalTime", 0);
    }
    playSequence(sequenceNumber, offset) {
      const sequence = this.channel[1][sequenceNumber];
      const speed = 60 / (this.ticksPerBeat * this.beatsPerMinute);
      if (!sequence) {
        return;
      }
      for (const note of sequence) {
        for (let pIdx = 0; pIdx < note.p.length; pIdx += 1) {
          const point = note.p[pIdx];
          const t = point.t * speed + offset;
          for (let i = 0; i < note.n.length; i += 1) {
            const pitch = note.n[i];
            const [oscillator, gainNode] = this.get(i);
            if (pIdx === 0) {
              gainNode.gain.setValueAtTime(point.v / 100, t + 0.01);
            } else {
              gainNode.gain.exponentialRampToValueAtTime(
                point.v / 100 || 1e-5,
                t - 0.03
              );
            }
            if (pIdx === note.p.length - 1) {
              gainNode.gain.exponentialRampToValueAtTime(1e-4, t);
            }
            const pitchHz = pIdx === note.p.length - 1 ? 0 : getPitch(440, pitch - 8);
            oscillator.frequency.setValueAtTime(pitchHz, t);
            if (t > this.finalTime) {
              this.finalTime = t;
            }
          }
        }
      }
    }
    /** Schedule the whole song starting at `startTime` (AudioContext seconds). Returns when it ends. */
    play(startTime) {
      this.finalTime = 0;
      for (let barNumber = 0; barNumber < this.channel[2].length; barNumber += 1) {
        const sequenceNumber = this.channel[2][barNumber] - 1;
        this.playSequence(
          sequenceNumber,
          startTime + barNumber * this.beatsPerBar * 60 / this.beatsPerMinute
        );
      }
      return this.finalTime;
    }
    get(n) {
      if (n >= this.oscillatorPool.length) {
        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();
        gainNode.connect(this.parent);
        oscillator.connect(gainNode);
        oscillator.frequency.setValueAtTime(0, 0);
        oscillator.type = this.channel[0].wave;
        oscillator.start();
        this.oscillatorPool.push(oscillator);
        this.gainPool.push(gainNode);
      }
      return [this.oscillatorPool[n], this.gainPool[n]];
    }
  };
  var Song = class {
    constructor(channels2, ticksPerBeat, beatsPerMinute, beatsPerBar, loopBars2) {
      __publicField(this, "beatsPerMinute", beatsPerMinute);
      __publicField(this, "beatsPerBar", beatsPerBar);
      __publicField(this, "loopBars", loopBars2);
      __publicField(this, "channels", []);
      __publicField(this, "context");
      __publicField(this, "master");
      __publicField(this, "nextStart", 0);
      __publicField(this, "timer", 0);
      __publicField(this, "muted", false);
      const context = this.context = new AudioContext();
      const gainNode = this.master = context.createGain();
      gainNode.gain.value = 0.02;
      gainNode.connect(context.destination);
      for (const channel of channels2) {
        this.channels.push(
          new Channel(
            context,
            gainNode,
            channel,
            ticksPerBeat,
            beatsPerMinute,
            beatsPerBar
          )
        );
      }
    }
    /**
     * Start the looping music. The next loop is scheduled on the audio clock
     * shortly before the current one ends, so suspending the context (pause,
     * hidden tab) simply holds the music where it is.
     */
    play() {
      this.nextStart = this.context.currentTime + 0.1;
      this.scheduleLoop();
      this.timer = window.setInterval(() => {
        if (this.context.currentTime > this.nextStart - 1) {
          this.scheduleLoop();
        }
      }, 250);
    }
    scheduleLoop() {
      const start = this.nextStart;
      let end = start;
      for (const channel of this.channels) {
        end = Math.max(end, channel.play(start));
      }
      this.nextStart = end + 0.8;
    }
    setMuted(muted2) {
      this.muted = muted2;
      this.master.gain.setValueAtTime(muted2 ? 0 : 0.02, this.context.currentTime);
    }
    suspend() {
      if (this.context.state === "running") {
        this.context.suspend();
      }
    }
    resume() {
      if (this.context.state === "suspended") {
        this.context.resume();
      }
    }
  };

  // audio/waves.ts
  var SQUARE = "square";
  var TRIANGLE = "triangle";
  var WHITE = "sawtooth";

  // audio/envelopes.ts
  var SUDDEN = 0;
  var SMOOTH = 1;

  // audio/filters.ts
  var SUSTAIN_SHARP = 0;

  // music/cartoonGraveyard3.ts
  var bpm = 151;
  var bpb = 8;
  var tpb = 4;
  var loopBars = 14;
  var channels = [
    [{
      wave: TRIANGLE,
      envelope: SMOOTH,
      filter: SUSTAIN_SHARP
    }, [[{
      n: [54],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 2,
        b: 0,
        v: 100
      }]
    }, {
      n: [55],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 6,
        b: 0,
        v: 100
      }]
    }, {
      n: [54],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 10,
        b: 0,
        v: 100
      }]
    }, {
      n: [51],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 14,
        b: 0,
        v: 100
      }]
    }, {
      n: [47],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 18,
        b: 0,
        v: 100
      }]
    }, {
      n: [56, 55],
      p: [{
        t: 24,
        b: 0,
        v: 100
      }, {
        t: 26,
        b: 0,
        v: 100
      }]
    }], [{
      n: [54],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 2,
        b: 0,
        v: 100
      }]
    }, {
      n: [50],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 6,
        b: 0,
        v: 100
      }]
    }, {
      n: [47],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 10,
        b: 0,
        v: 100
      }]
    }, {
      n: [44],
      p: [{
        t: 10,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [42],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 14,
        b: 0,
        v: 100
      }]
    }, {
      n: [42],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 18,
        b: 0,
        v: 100
      }]
    }], [{
      n: [56],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 2,
        b: 0,
        v: 100
      }]
    }, {
      n: [56],
      p: [{
        t: 2,
        b: 0,
        v: 100
      }, {
        t: 4,
        b: 0,
        v: 100
      }]
    }, {
      n: [59],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 6,
        b: 0,
        v: 100
      }]
    }, {
      n: [63],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 10,
        b: 0,
        v: 100
      }]
    }, {
      n: [66],
      p: [{
        t: 10,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [67],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 14,
        b: 0,
        v: 100
      }]
    }, {
      n: [71],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 18,
        b: 0,
        v: 100
      }]
    }], [{
      n: [54],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 4,
        b: 0,
        v: 100
      }]
    }, {
      n: [51],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 8,
        b: 0,
        v: 100
      }]
    }, {
      n: [56],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [59],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 16,
        b: 0,
        v: 100
      }]
    }, {
      n: [54],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 20,
        b: 0,
        v: 100
      }]
    }, {
      n: [51],
      p: [{
        t: 20,
        b: 0,
        v: 100
      }, {
        t: 24,
        b: 0,
        v: 100
      }]
    }, {
      n: [47],
      p: [{
        t: 24,
        b: 0,
        v: 100
      }, {
        t: 28,
        b: 0,
        v: 100
      }]
    }], [{
      n: [56],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 2,
        b: 0,
        v: 100
      }]
    }, {
      n: [56],
      p: [{
        t: 2,
        b: 0,
        v: 100
      }, {
        t: 4,
        b: 0,
        v: 100
      }]
    }, {
      n: [54],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 6,
        b: 0,
        v: 100
      }]
    }, {
      n: [51],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 10,
        b: 0,
        v: 100
      }]
    }, {
      n: [50],
      p: [{
        t: 10,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [47],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 14,
        b: 0,
        v: 100
      }]
    }, {
      n: [44, 43],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 18,
        b: 0,
        v: 100
      }]
    }], [{
      n: [54],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 4,
        b: 0,
        v: 100
      }]
    }, {
      n: [51],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 8,
        b: 0,
        v: 100
      }]
    }, {
      n: [56],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [59],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 16,
        b: 0,
        v: 100
      }]
    }, {
      n: [60],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 20,
        b: 0,
        v: 100
      }]
    }, {
      n: [59],
      p: [{
        t: 20,
        b: 0,
        v: 100
      }, {
        t: 24,
        b: 0,
        v: 100
      }]
    }, {
      n: [63],
      p: [{
        t: 24,
        b: 0,
        v: 100
      }, {
        t: 28,
        b: 0,
        v: 100
      }]
    }], [{
      n: [56],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 2,
        b: 0,
        v: 100
      }]
    }, {
      n: [55],
      p: [{
        t: 2,
        b: 0,
        v: 100
      }, {
        t: 4,
        b: 0,
        v: 100
      }]
    }, {
      n: [56],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 6,
        b: 0,
        v: 100
      }]
    }, {
      n: [59],
      p: [{
        t: 6,
        b: 0,
        v: 100
      }, {
        t: 8,
        b: 0,
        v: 100
      }]
    }, {
      n: [56],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 10,
        b: 0,
        v: 100
      }]
    }, {
      n: [55],
      p: [{
        t: 10,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [56],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 14,
        b: 0,
        v: 100
      }]
    }, {
      n: [59],
      p: [{
        t: 14,
        b: 0,
        v: 100
      }, {
        t: 16,
        b: 0,
        v: 100
      }]
    }, {
      n: [56],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 18,
        b: 0,
        v: 100
      }]
    }, {
      n: [55],
      p: [{
        t: 18,
        b: 0,
        v: 100
      }, {
        t: 20,
        b: 0,
        v: 100
      }]
    }, {
      n: [54, 59],
      p: [{
        t: 24,
        b: 0,
        v: 100
      }, {
        t: 26,
        b: 0,
        v: 100
      }]
    }], [{
      n: [56],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 2,
        b: 0,
        v: 100
      }]
    }, {
      n: [55],
      p: [{
        t: 2,
        b: 0,
        v: 100
      }, {
        t: 4,
        b: 0,
        v: 100
      }]
    }, {
      n: [56],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 6,
        b: 0,
        v: 100
      }]
    }, {
      n: [59],
      p: [{
        t: 6,
        b: 0,
        v: 100
      }, {
        t: 8,
        b: 0,
        v: 100
      }]
    }, {
      n: [56],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 10,
        b: 0,
        v: 100
      }]
    }, {
      n: [55],
      p: [{
        t: 10,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [54],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 14,
        b: 0,
        v: 100
      }]
    }, {
      n: [51],
      p: [{
        t: 14,
        b: 0,
        v: 100
      }, {
        t: 16,
        b: 0,
        v: 100
      }]
    }, {
      n: [50],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 18,
        b: 0,
        v: 100
      }]
    }, {
      n: [47],
      p: [{
        t: 18,
        b: 0,
        v: 100
      }, {
        t: 20,
        b: 0,
        v: 100
      }]
    }]], [1, 2, 1, 2, 3, 5, 4, 6, 4, 6, 1, 2, 7, 8, 1, 1]],
    [{
      wave: SQUARE,
      envelope: SUDDEN,
      filter: SUSTAIN_SHARP
    }, [[{
      n: [35],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 8,
        b: 0,
        v: 100
      }]
    }, {
      n: [43],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 16,
        b: 0,
        v: 100
      }]
    }], [{
      n: [44],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 8,
        b: 0,
        v: 100
      }]
    }, {
      n: [38],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 16,
        b: 0,
        v: 100
      }]
    }], [{
      n: [38],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 8,
        b: 0,
        v: 100
      }]
    }, {
      n: [31],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 16,
        b: 0,
        v: 100
      }]
    }, {
      n: [38],
      p: [{
        t: 20,
        b: 0,
        v: 100
      }, {
        t: 24,
        b: 0,
        v: 100
      }]
    }, {
      n: [35],
      p: [{
        t: 28,
        b: 0,
        v: 100
      }, {
        t: 32,
        b: 0,
        v: 100
      }]
    }], [{
      n: [35],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 4,
        b: 0,
        v: 100
      }]
    }, {
      n: [38],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [35],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 20,
        b: 0,
        v: 100
      }]
    }, {
      n: [38],
      p: [{
        t: 24,
        b: 0,
        v: 100
      }, {
        t: 28,
        b: 0,
        v: 100
      }]
    }], [], [], [], []], [1, 2, 1, 2, 1, 2, 3, 3, 3, 3, 1, 2, 4, 4, 1, 1]],
    [{
      wave: SQUARE,
      envelope: SUDDEN,
      filter: SUSTAIN_SHARP
    }, [[{
      n: [18],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 4,
        b: 0,
        v: 100
      }]
    }, {
      n: [26],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [18],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 20,
        b: 0,
        v: 100
      }]
    }, {
      n: [30],
      p: [{
        t: 24,
        b: 0,
        v: 100
      }, {
        t: 28,
        b: 0,
        v: 100
      }]
    }], [{
      n: [18],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 4,
        b: 0,
        v: 100
      }]
    }, {
      n: [26],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [18],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 20,
        b: 0,
        v: 100
      }]
    }, {
      n: [23],
      p: [{
        t: 24,
        b: 0,
        v: 100
      }, {
        t: 28,
        b: 0,
        v: 100
      }]
    }], [{
      n: [26],
      p: [{
        t: 0,
        b: 0,
        v: 100
      }, {
        t: 4,
        b: 0,
        v: 100
      }]
    }, {
      n: [19],
      p: [{
        t: 8,
        b: 0,
        v: 100
      }, {
        t: 12,
        b: 0,
        v: 100
      }]
    }, {
      n: [26],
      p: [{
        t: 16,
        b: 0,
        v: 100
      }, {
        t: 20,
        b: 0,
        v: 100
      }]
    }, {
      n: [23],
      p: [{
        t: 24,
        b: 0,
        v: 100
      }, {
        t: 28,
        b: 0,
        v: 100
      }]
    }], [{
      n: [18],
      p: [{
        t: 4,
        b: 0,
        v: 100
      }, {
        t: 8,
        b: 0,
        v: 100
      }]
    }, {
      n: [19],
      p: [{
        t: 12,
        b: 0,
        v: 100
      }, {
        t: 16,
        b: 0,
        v: 100
      }]
    }, {
      n: [18],
      p: [{
        t: 20,
        b: 0,
        v: 100
      }, {
        t: 24,
        b: 0,
        v: 100
      }]
    }, {
      n: [20, 18],
      p: [{
        t: 28,
        b: 0,
        v: 100
      }, {
        t: 32,
        b: 0,
        v: 100
      }]
    }], [], [], [], []], [1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 1, 1, 4, 4, 1, 1]],
    [{
      wave: WHITE,
      envelope: SUDDEN
    }, [[], [], [], [], [], [], [], []], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]]
  ];

  // main.ts
  var STORAGE_PREFIX = "get-gerry-home:";
  function load(key) {
    try {
      return localStorage.getItem(STORAGE_PREFIX + key);
    } catch (e) {
      return null;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch (e) {
    }
  }
  var $ = (id) => document.getElementById(id);
  var hudLevel = $("hud-level");
  var hudBest = $("hud-best");
  var toast = $("toast");
  var muteButton = $("mute");
  var pauseButton = $("pause");
  var screen = "title";
  pauseClock();
  var renderer;
  var game;
  try {
    renderer = new Renderer();
    game = new Game(renderer);
  } catch (e) {
    $("title").hidden = true;
    $("no-webgl").hidden = false;
    throw e;
  }
  var best = Math.max(0, parseInt(load("best") || "0", 10) || 0);
  game.maxLevel = best;
  function updateHud() {
    hudLevel.textContent = String(game.level + 1);
    hudBest.textContent = String(best + 1);
  }
  var toastTimer = 0;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1800);
  }
  game.onLevelChange = (level) => {
    if (level > best) {
      best = level;
      save("best", String(best));
    }
    updateHud();
    if (level > 0) {
      showToast(`Level ${level + 1}`);
    }
  };
  game.onLost = (reached) => {
    $("lost-level").textContent = String(reached + 1);
    $("lost-best").textContent = String(best + 1);
    setScreen("lost");
  };
  updateHud();
  var song = null;
  var muted = load("muted") === "1";
  function updateMuteButton() {
    muteButton.classList.toggle("off", muted);
    muteButton.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
    muteButton.title = muted ? "Unmute music" : "Mute music";
  }
  updateMuteButton();
  function startMusic() {
    if (song) {
      song.resume();
      return;
    }
    try {
      song = new Song(
        channels,
        tpb,
        bpm,
        bpb,
        loopBars
      );
      song.setMuted(muted);
      song.play();
      song.resume();
    } catch (e) {
      song = null;
    }
  }
  muteButton.addEventListener("click", () => {
    muted = !muted;
    save("muted", muted ? "1" : "0");
    updateMuteButton();
    if (song) {
      song.setMuted(muted);
    }
    muteButton.blur();
  });
  function setScreen(next) {
    screen = next;
    for (const id of ["title", "paused", "lost"]) {
      $(id).hidden = id !== next;
    }
    document.body.classList.toggle("playing", next === "playing");
    game.releaseInput();
    if (next === "playing") {
      resumeClock();
      startMusic();
    } else {
      pauseClock();
      if (song) {
        song.suspend();
      }
    }
  }
  function play() {
    if (screen === "lost") {
      updateHud();
    }
    setScreen("playing");
  }
  $("play-button").addEventListener("click", play);
  $("resume-button").addEventListener("click", play);
  $("retry-button").addEventListener("click", play);
  pauseButton.addEventListener("click", () => {
    if (screen === "playing") {
      setScreen("paused");
    } else if (screen === "paused") {
      play();
    }
    pauseButton.blur();
  });
  addEventListener("keydown", (evt) => {
    if (evt.repeat) {
      return;
    }
    if (screen === "playing") {
      if (evt.key === "Escape" || evt.key === "p" || evt.key === "P") {
        setScreen("paused");
      }
    } else if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      play();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && screen === "playing") {
      setScreen("paused");
    }
  });
  var resize = () => renderer.resize();
  addEventListener("resize", resize);
  addEventListener("orientationchange", resize);
  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe(renderer.canvas);
  }
  function render() {
    const gl2 = renderer.gl;
    gl2.clear(gl2.COLOR_BUFFER_BIT);
    game.draw();
    requestAnimationFrame(render);
  }
  render();
  window.gerry = { game, setScreen, pauseClock, resumeClock, now };
})();
