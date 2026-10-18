"""Write the runtime container: 'SWHM' magic, u32 version, u32 header length, JSON header,
then 4-byte-aligned binary blobs. The header names every blob with its dtype and shape;
float data may be stored quantised (int16 with per-axis offset/scale) to halve the size."""
import json
import struct
import numpy as np

DTYPES = {'f4': '<f4', 'u1': '<u1', 'u2': '<u2', 'u4': '<u4', 'i2': '<i2', 'i1': '<i1'}


class Pack:
    def __init__(self):
        self.header = {'blobs': {}}
        self.chunks = []
        self.size = 0

    def blob(self, name, array, dtype=None, quantize=False):
        a = np.asarray(array)
        entry = {'shape': list(a.shape)}
        if quantize:
            a = a.astype(np.float64).reshape(len(a), -1)
            lo, hi = a.min(0), a.max(0)
            scale = np.where(hi > lo, (hi - lo) / 65534.0, 1.0)
            q = np.round((a - lo) / scale - 32767).astype('<i2')
            entry.update(dtype='i2', quant={'offset': (lo + 32767 * scale).tolist(), 'scale': scale.tolist()})
            data = q.tobytes()
        else:
            dtype = dtype or {'f': 'f4', 'u': 'u4', 'i': 'u4', 'b': 'u1'}[a.dtype.kind]
            entry['dtype'] = dtype
            data = a.astype(DTYPES[dtype]).tobytes()
        pad = (-self.size) % 4
        if pad:
            self.chunks.append(b'\0' * pad)
            self.size += pad
        entry['offset'] = self.size
        entry['bytes'] = len(data)
        self.chunks.append(data)
        self.size += len(data)
        self.header['blobs'][name] = entry
        return name

    def write(self, path, **meta):
        self.header.update(meta)
        head = json.dumps(self.header, separators=(',', ':')).encode()
        head += b' ' * ((-len(head) - 12) % 4)
        with open(path, 'wb') as f:
            f.write(b'SWHM' + struct.pack('<II', 1, len(head)) + head)
            for c in self.chunks:
                f.write(c)
        return 12 + len(head) + self.size
