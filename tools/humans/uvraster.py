"""Paint per-vertex fields into a mesh's UV layout, plus mesh-surface distance fields.

rasterize(uv, tri_uv_idx, tri_vert_idx, values, size) -> (image HxWxC, coverage mask)
  values are per *position* vertex; each triangle interpolates its corners' values
  barycentrically at every texel centre it covers (UV origin bottom-left, as in OBJ).
dilate(img, mask, px) pads islands outwards so mipmaps and bilinear filtering never pull in
  the empty background (seams stay clean).
surface_distance(pos, tris, seeds) -> geodesic-ish distance from a vertex set along mesh edges.
"""
import numpy as np


def rasterize(uv, tuv, tv, values, size):
    values = np.asarray(values, np.float32)
    if values.ndim == 1:
        values = values[:, None]
    C = values.shape[1]
    H = W = size
    img = np.zeros((H, W, C), np.float32)
    mask = np.zeros((H, W), bool)
    P = uv[tuv] * [W, H]  # (T,3,2) in pixel units, y up
    for t in range(len(tuv)):
        a, b, c = P[t]
        x0 = max(int(np.floor(min(a[0], b[0], c[0]))), 0)
        x1 = min(int(np.ceil(max(a[0], b[0], c[0]))), W - 1)
        y0 = max(int(np.floor(min(a[1], b[1], c[1]))), 0)
        y1 = min(int(np.ceil(max(a[1], b[1], c[1]))), H - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
        w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
        if not inside.any():
            continue
        va, vb, vc = values[tv[t]]
        val = w0[..., None] * va + w1[..., None] * vb + w2[..., None] * vc
        rows = (H - 1 - (ys[inside] - 0.5)).astype(int)  # flip: image row 0 is UV v = 1
        cols = (xs[inside] - 0.5).astype(int)
        img[rows, cols] = val[inside]
        mask[rows, cols] = True
    return img, mask


def dilate(img, mask, px=8):
    """Grow covered texels outwards by up to px texels (average of covered neighbours)."""
    img = img.copy()
    mask = mask.copy()
    for _ in range(px):
        acc = np.zeros_like(img)
        cnt = np.zeros(mask.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            m = np.roll(np.roll(mask, dy, 0), dx, 1)
            v = np.roll(np.roll(img, dy, 0), dx, 1)
            acc += v * m[..., None]
            cnt += m
        grow = (~mask) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]
        mask |= grow
    return img, mask


def surface_distance(pos, tris, seeds, limit=np.inf):
    """Shortest-path distance along mesh edges from any seed vertex (Dijkstra)."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra
    e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    e = np.unique(np.sort(e, 1), axis=0)
    w = np.linalg.norm(pos[e[:, 0]] - pos[e[:, 1]], axis=1)
    n = len(pos)
    g = coo_matrix((np.concatenate([w, w]), (np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]]))), shape=(n, n)).tocsr()
    d = dijkstra(g, directed=False, indices=np.asarray(seeds), min_only=True, limit=limit)
    return d
