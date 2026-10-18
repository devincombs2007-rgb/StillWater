"""Load MakeHuman's base.obj (CC0) into numpy arrays.

Positions are indexed in base.obj's own vertex order (19158 vertices including helper
geometry), which is the index space .target files use. Faces are quads; each face corner has
a position index and a UV index (UVs are per corner because of seams).
"""
import os
import numpy as np

MH_DATA = os.environ.get('MH_DATA', '/home/user/makehumancommunity/makehuman/makehuman/data')


def load_obj(path=None):
    path = path or os.path.join(MH_DATA, '3dobjs', 'base.obj')
    pos, uvs, fv, ft, fg, groups = [], [], [], [], [], []
    group = None
    for line in open(path):
        if line.startswith('v '):
            pos.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            uvs.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '):
            group = line.split()[1]
            if group not in groups:
                groups.append(group)
        elif line.startswith('f '):
            corners = line.split()[1:]
            if len(corners) == 3:
                corners.append(corners[2])
            fv.append([int(c.split('/')[0]) - 1 for c in corners])
            ft.append([int(c.split('/')[1]) - 1 for c in corners])
            fg.append(groups.index(group))
    return {
        'pos': np.array(pos, np.float64),
        'uv': np.array(uvs, np.float64),
        'fv': np.array(fv, np.int64),
        'ft': np.array(ft, np.int64),
        'fg': np.array(fg, np.int64),
        'groups': groups,
    }


def group_faces(mesh, name):
    return np.nonzero(mesh['fg'] == mesh['groups'].index(name))[0]


def group_verts(mesh, name):
    return np.unique(mesh['fv'][group_faces(mesh, name)])


if __name__ == '__main__':
    m = load_obj()
    print(len(m['pos']), 'verts', len(m['uv']), 'uvs', len(m['fv']), 'faces', len(m['groups']), 'groups')
    b = group_verts(m, 'body')
    p = m['pos'][b]
    print('body verts', len(b), 'range', b.min(), b.max(), 'bbox', p.min(0).round(3), p.max(0).round(3))
