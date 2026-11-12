import test from 'node:test'
import assert from 'node:assert/strict'
import '../core.js'
import '../seams.js'

const { seamColumns } = globalThis.XLargeImage
function strip(paint, width = 10, height = 100) {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4)
    }
    return { data, width, height }
}
const detail = y => [30 + y * 2, 20 + y, 80 + y, 255]

test('removes narrow solid gutters from either side of the join', () => {
    for (const columns of [[4], [5], [3, 4, 5, 6]]) {
        const image = strip((x, y) => columns.includes(x) ? [255, 255, 255, 255] : detail(y))
        assert.deepEqual(seamColumns(image, 5, 3), columns)
    }
})

test('removes colored, transparent and slightly noisy gutters', () => {
    for (const color of [[20, 100, 50, 255], [0, 0, 0, 0]]) {
        assert.deepEqual(seamColumns(strip((x, y) => x === 5 ? color : detail(y)), 5, 3), [5])
    }
    assert.deepEqual(seamColumns(strip((x, y) => x === 4 ? [250 + y % 4, 250, 250, 255] : detail(y)), 5, 3), [4])
})

test('detects a thin edge washed out by a solid color', () => {
    for (const slope of [0.24, 0.64]) {
        const image = strip((x, y) => x === 5 ? detail(y).map((v, c) => c === 3 ? 255 : Math.round(v * slope + 255 * (1 - slope))) : detail(y))
        assert.deepEqual(seamColumns(image, 5, 3), [5])
    }
})

test('preserves broad backgrounds, uninterrupted details and ordinary color boundaries', () => {
    assert.deepEqual(seamColumns(strip(() => [255, 255, 255, 255]), 5, 3), [])
    assert.deepEqual(seamColumns(strip((x, y) => detail(y)), 5, 3), [])
    assert.deepEqual(seamColumns(strip(x => x < 5 ? [255, 0, 0, 255] : [0, 0, 255, 255]), 5, 3), [])
    assert.deepEqual(seamColumns(strip((x, y) => x >= 1 && x <= 8 ? [255, 255, 255, 255] : detail(y)), 5, 3), [])
})

test('preserves a thin detailed edge that does not fit a solid-color overlay', () => {
    const image = strip((x, y) => x === 5 ? [y % 2 * 255, 80, 140, 255] : detail(y))
    assert.deepEqual(seamColumns(image, 5, 3), [])
})
