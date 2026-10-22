import { readFileSync, writeFileSync } from 'node:fs';

const GLTF_URL = 'https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/main/glTF/AnimationLibrary_Godot_Standard.gltf';
const BIN_URL = 'https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/main/glTF/AnimationLibrary_Godot_Standard.bin';
const OUT = 'public/models/Human.glb';

const KEEP = [
  ['Idle_Loop', 'Idle'],
  ['Walk_Loop', 'Walking'],
  ['Punch_Jab', 'Punch'],
];

const gltfRes = await fetch(GLTF_URL);
if (!gltfRes.ok) throw new Error(`gltf ${gltfRes.status}`);
const binRes = await fetch(BIN_URL);
if (!binRes.ok) throw new Error(`bin ${binRes.status}`);
const gltf = await gltfRes.json();
const bin = Buffer.from(await binRes.arrayBuffer());

const byName = new Map((gltf.animations ?? []).map((clip) => [clip.name, clip]));
const animations = [];
for (const [src, dest] of KEEP) {
  if (/pistol/i.test(src) || /pistol/i.test(dest)) {
    console.error('pistol clip is not allowed');
    process.exit(1);
  }
  const clip = byName.get(src);
  if (!clip) {
    console.error(`missing clip ${src}`);
    process.exit(1);
  }
  animations.push({ ...clip, name: dest });
}
if (!gltf.meshes?.length || !gltf.skins?.length || !gltf.buffers?.[0]) {
  console.error('library file has no skinned mesh');
  process.exit(1);
}
gltf.animations = animations;
delete gltf.buffers[0].uri;

const json = Buffer.from(JSON.stringify(gltf));
const jsonPad = (4 - (json.length % 4)) % 4;
const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
const binPad = (4 - (bin.length % 4)) % 4;
const binChunk = Buffer.concat([bin, Buffer.alloc(binPad)]);

function chunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(data.length, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, data]);
}

const body = Buffer.concat([
  chunk(0x4e4f534a, jsonChunk),
  chunk(0x004e4942, binChunk),
]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + body.length, 8);
writeFileSync(OUT, Buffer.concat([header, body]));

const read = readFileSync(OUT);
const jsonLen = read.readUInt32LE(12);
const back = JSON.parse(read.subarray(20, 20 + jsonLen).toString('utf8'));
const names = back.animations.map((clip) => clip.name);
if (names.join(',') !== 'Idle,Walking,Punch') {
  console.error(names);
  process.exit(1);
}
if (names.some((name) => /pistol/i.test(name))) process.exit(1);
for (const name of names) console.log(name);
console.log(`wrote ${OUT}`);
