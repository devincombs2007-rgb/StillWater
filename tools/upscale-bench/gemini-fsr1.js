// Gemini's v1.8.1 upscaler (FSR 1.0-style EASU + RCAS), lifted verbatim from its scene.js so
// the bench can run it on the same frames as Clearwater. `fixColour` applies the one-line
// fix for its missing tone mapping / sRGB step (see docs/UPSCALER.md); without it the pipeline
// is exactly as Gemini shipped it.
export function createGeminiFsr1(renderer, T, {fixColour = false} = {}) {
  let sceneTarget = null,
    fsrEasuTarget = null;
  const fsrCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsrScene = new T.Scene();
  const fsrQuadGeo = new T.PlaneGeometry(2, 2);

  const fsrVertexShader = `varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

  const fsrEasuMaterial = new T.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tInput: {value: null},
      inputSize: {value: new T.Vector4(1, 1, 1, 1)},
      outputSize: {value: new T.Vector4(1, 1, 1, 1)},
    },
    vertexShader: fsrVertexShader,
    fragmentShader: `precision highp float;
    uniform sampler2D tInput;
    uniform vec4 inputSize;
    uniform vec4 outputSize;
    varying vec2 vUv;

    float getLuma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    float lanczos2(float x) {
      if (x == 0.0) return 1.0;
      if (abs(x) >= 2.0) return 0.0;
      float piX = 3.14159265359 * x;
      return (sin(piX) / piX) * (sin(0.5 * piX) / (0.5 * piX));
    }

    void main() {
      vec2 pos = vUv * inputSize.xy - 0.5;
      vec2 f = fract(pos);
      vec2 baseUv = (floor(pos) + 0.5) * inputSize.zw;
      vec2 inv = inputSize.zw;

      vec3 c00 = texture2D(tInput, baseUv + vec2(-1.0, -1.0) * inv).rgb;
      vec3 c10 = texture2D(tInput, baseUv + vec2( 0.0, -1.0) * inv).rgb;
      vec3 c20 = texture2D(tInput, baseUv + vec2( 1.0, -1.0) * inv).rgb;
      vec3 c30 = texture2D(tInput, baseUv + vec2( 2.0, -1.0) * inv).rgb;

      vec3 c01 = texture2D(tInput, baseUv + vec2(-1.0,  0.0) * inv).rgb;
      vec3 c11 = texture2D(tInput, baseUv + vec2( 0.0,  0.0) * inv).rgb;
      vec3 c21 = texture2D(tInput, baseUv + vec2( 1.0,  0.0) * inv).rgb;
      vec3 c31 = texture2D(tInput, baseUv + vec2( 2.0,  0.0) * inv).rgb;

      vec3 c02 = texture2D(tInput, baseUv + vec2(-1.0,  1.0) * inv).rgb;
      vec3 c12 = texture2D(tInput, baseUv + vec2( 0.0,  1.0) * inv).rgb;
      vec3 c22 = texture2D(tInput, baseUv + vec2( 1.0,  1.0) * inv).rgb;
      vec3 c32 = texture2D(tInput, baseUv + vec2( 2.0,  1.0) * inv).rgb;

      vec3 c03 = texture2D(tInput, baseUv + vec2(-1.0,  2.0) * inv).rgb;
      vec3 c13 = texture2D(tInput, baseUv + vec2( 0.0,  2.0) * inv).rgb;
      vec3 c23 = texture2D(tInput, baseUv + vec2( 1.0,  2.0) * inv).rgb;
      vec3 c33 = texture2D(tInput, baseUv + vec2( 2.0,  2.0) * inv).rgb;

      float l11 = getLuma(c11);
      float l21 = getLuma(c21);
      float l12 = getLuma(c12);
      float l22 = getLuma(c22);

      float dX = (l21 - l11) + (l22 - l12);
      float dY = (l12 - l11) + (l22 - l21);
      float edgeStrength = length(vec2(dX, dY));
      vec2 dir = edgeStrength > 0.0001 ? vec2(-dY, dX) / edgeStrength : vec2(1.0, 0.0);

      vec3 minC = min(min(c11, c21), min(c12, c22));
      vec3 maxC = max(max(c11, c21), max(c12, c22));

      vec3 colorSum = vec3(0.0);
      float weightSum = 0.0;

      for (int y = -1; y <= 2; y++) {
        for (int x = -1; x <= 2; x++) {
          vec2 sampleOffset = vec2(float(x) - f.x, float(y) - f.y);
          float distProj = abs(dot(sampleOffset, dir));
          float distPerp = abs(dot(sampleOffset, vec2(-dir.y, dir.x)));
          float w = lanczos2(distProj * 0.75) * lanczos2(distPerp * 1.35);

          vec3 c;
          if (y == -1) {
            c = (x == -1) ? c00 : (x == 0) ? c10 : (x == 1) ? c20 : c30;
          } else if (y == 0) {
            c = (x == -1) ? c01 : (x == 0) ? c11 : (x == 1) ? c21 : c31;
          } else if (y == 1) {
            c = (x == -1) ? c02 : (x == 0) ? c12 : (x == 1) ? c22 : c32;
          } else {
            c = (x == -1) ? c03 : (x == 0) ? c13 : (x == 1) ? c23 : c33;
          }

          colorSum += c * w;
          weightSum += w;
        }
      }

      vec3 finalColor = weightSum > 0.0001 ? colorSum / weightSum : c11;
      finalColor = clamp(finalColor, minC, maxC);
      gl_FragColor = vec4(finalColor, 1.0);
    }`,
  });

  const fsrRcasMaterial = new T.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tInput: {value: null},
      outputSize: {value: new T.Vector4(1, 1, 1, 1)},
      sharpness: {value: 0.75},
    },
    vertexShader: fsrVertexShader,
    fragmentShader: `precision highp float;
    uniform sampler2D tInput;
    uniform vec4 outputSize;
    uniform float sharpness;
    varying vec2 vUv;

    float getLuma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 inv = outputSize.zw;
      vec3 cM = texture2D(tInput, vUv).rgb;
      vec3 cN = texture2D(tInput, vUv + vec2( 0.0, -1.0) * inv).rgb;
      vec3 cS = texture2D(tInput, vUv + vec2( 0.0,  1.0) * inv).rgb;
      vec3 cW = texture2D(tInput, vUv + vec2(-1.0,  0.0) * inv).rgb;
      vec3 cE = texture2D(tInput, vUv + vec2( 1.0,  0.0) * inv).rgb;

      float lM = getLuma(cM);
      float lN = getLuma(cN);
      float lS = getLuma(cS);
      float lW = getLuma(cW);
      float lE = getLuma(cE);

      float minL = min(lM, min(min(lN, lS), min(lW, lE)));
      float maxL = max(lM, max(max(lN, lS), max(lW, lE)));

      float hitMin = minL;
      float hitMax = 1.0 - maxL;
      float lobe = max(0.0, min(hitMin, hitMax) / max(0.0001, maxL));
      lobe = clamp(lobe, 0.0, 0.25);

      float w = -lobe * (sharpness * 1.25);
      vec3 sharpColor = (cM + (cN + cS + cW + cE) * w) / (1.0 + 4.0 * w);

      vec3 minColor = min(cM, min(min(cN, cS), min(cW, cE)));
      vec3 maxColor = max(cM, max(max(cN, cS), max(cW, cE)));
      sharpColor = clamp(sharpColor, minColor, maxColor);

      gl_FragColor = vec4(sharpColor, 1.0);
    }`,
  });

  const fsrQuad = new T.Mesh(fsrQuadGeo, fsrEasuMaterial);
  fsrScene.add(fsrQuad);
  const size = new T.Vector2();
  function render(draw, camera, {scale = 0.67, sharpness = 0.75} = {}) {
    renderer.getDrawingBufferSize(size);
    const dispW = size.x,
      dispH = size.y;
    const inputW = Math.max(64, Math.round(dispW * scale));
    const inputH = Math.max(64, Math.round(dispH * scale));
    if (!sceneTarget || sceneTarget.width !== inputW || sceneTarget.height !== inputH) {
      sceneTarget?.dispose();
      sceneTarget = new T.WebGLRenderTarget(inputW, inputH, {
        minFilter: T.LinearFilter,
        magFilter: T.LinearFilter,
        type: T.HalfFloatType,
        samples: 4,
        depthBuffer: true,
        stencilBuffer: false,
      });
      if (fixColour) {
        sceneTarget.isXRRenderTarget = true;
        sceneTarget.texture.colorSpace = T.SRGBColorSpace;
      }
    }
    if (!fsrEasuTarget || fsrEasuTarget.width !== dispW || fsrEasuTarget.height !== dispH) {
      fsrEasuTarget?.dispose();
      fsrEasuTarget = new T.WebGLRenderTarget(dispW, dispH, {
        minFilter: T.LinearFilter,
        magFilter: T.LinearFilter,
        type: T.HalfFloatType,
        depthBuffer: false,
        stencilBuffer: false,
      });
    }
    fsrEasuMaterial.uniforms.inputSize.value.set(inputW, inputH, 1.0 / inputW, 1.0 / inputH);
    fsrEasuMaterial.uniforms.outputSize.value.set(dispW, dispH, 1.0 / dispW, 1.0 / dispH);
    fsrRcasMaterial.uniforms.outputSize.value.set(dispW, dispH, 1.0 / dispW, 1.0 / dispH);
    // Gemini's frame path, unchanged.
    renderer.setRenderTarget(sceneTarget);
    draw();
    renderer.setRenderTarget(fsrEasuTarget);
    renderer.clear();
    fsrQuad.material = fsrEasuMaterial;
    fsrEasuMaterial.uniforms.tInput.value = sceneTarget.texture;
    renderer.render(fsrScene, fsrCamera);
    renderer.setRenderTarget(null);
    renderer.clear();
    fsrQuad.material = fsrRcasMaterial;
    fsrRcasMaterial.uniforms.tInput.value = fsrEasuTarget.texture;
    fsrRcasMaterial.uniforms.sharpness.value = sharpness;
    renderer.render(fsrScene, fsrCamera);
  }
  return {render};
}
