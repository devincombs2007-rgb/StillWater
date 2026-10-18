"""MakeHuman .target files (CC0): sparse per-vertex offsets in base.obj index space.

Each data line is `index dx dy dz`. Parsing all 1554 files takes a while, so the parsed set is
cached in one .npz next to the build output.
"""
import os
import numpy as np
from mhmesh import MH_DATA

CACHE = os.environ.get('MH_TARGET_CACHE', '/tmp/claude-0/-home-user-StillWater/17d75e1f-23e8-56cd-b5ac-3c5684b26379/scratchpad/mh/targets-cache.npz')
ROOT = os.path.join(MH_DATA, 'targets')


def parse_target(path):
    idx, off = [], []
    for line in open(path):
        if not line or line[0] == '#':
            continue
        p = line.split()
        if len(p) == 4:
            idx.append(int(p[0]))
            off.append((float(p[1]), float(p[2]), float(p[3])))
    return np.array(idx, np.int32), np.array(off, np.float32).reshape(-1, 3)


_targets = None


def all_targets():
    """{relative path without .target: (indices, offsets)}"""
    global _targets
    if _targets is not None:
        return _targets
    if os.path.exists(CACHE):
        z = np.load(CACHE)
        names = list(z['names'])
        _targets = {n: (z[f'i{k}'], z[f'o{k}']) for k, n in enumerate(names)}
        return _targets
    found = {}
    for d, _, files in os.walk(ROOT):
        for f in files:
            if f.endswith('.target'):
                rel = os.path.relpath(os.path.join(d, f), ROOT)[: -len('.target')].replace(os.sep, '/')
                found[rel] = parse_target(os.path.join(d, f))
    names = sorted(found)
    arrays = {'names': np.array(names)}
    for k, n in enumerate(names):
        arrays[f'i{k}'], arrays[f'o{k}'] = found[n]
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    np.savez_compressed(CACHE, **arrays)
    _targets = found
    return found


def apply(base, weights):
    """base (N,3) + sum of weight * target offsets. weights: {target name: weight}."""
    out = base.astype(np.float64).copy()
    t = all_targets()
    for name, w in weights.items():
        if not w:
            continue
        i, o = t[name]
        out[i] += w * o
    return out


if __name__ == '__main__':
    import time
    t0 = time.time()
    t = all_targets()
    print(len(t), 'targets in', round(time.time() - t0, 1), 's')
    print(sorted(k for k in t if k.startswith('nose'))[:8])
