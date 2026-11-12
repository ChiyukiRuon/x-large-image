import test from 'node:test'
import assert from 'node:assert/strict'
import '../core.js'

const { originalUrl, photoLink, validateJob, layout } = globalThis.XLargeImage

test('requests original resolution for both X URL formats', () => {
    assert.equal(originalUrl('https://pbs.twimg.com/media/abc.jpg?name=small'), 'https://pbs.twimg.com/media/abc?format=jpg&name=orig')
    assert.equal(originalUrl('https://pbs.twimg.com/media/xyz?format=png&name=900x900'), 'https://pbs.twimg.com/media/xyz?format=png&name=orig')
})

test('rejects non-media URLs and arbitrary network targets', () => {
    for (const url of ['https://example.com/media/a.jpg', 'http://pbs.twimg.com/media/a.jpg', 'https://pbs.twimg.com/profile_images/a.jpg', 'https://pbs.twimg.com.evil.test/media/a.jpg']) {
        assert.throws(() => originalUrl(url))
    }
})

test('extracts attachment order separately from tweet identity', () => {
    assert.deepEqual(photoLink('/artist/status/123/photo/3'), { author: 'artist', statusId: '123', index: 3 })
    assert.equal(photoLink('/artist/status/123'), null)
    assert.equal(photoLink('https://example.com/artist/status/123/photo/1'), null)
    assert.equal(photoLink('/artist/status/123/photo/12').index, 12)
    assert.equal(photoLink('/artist/status/123/photo/0'), null)
    assert.equal(photoLink('/artist/status/123/photo/9007199254740993'), null)
})

test('horizontal stitching retains all pixels and has no seams', () => {
    assert.deepEqual(layout([{ width: 100, height: 200 }, { width: 150, height: 180 }]), {
        width: 250, height: 200,
        tiles: [{ x: 0, y: 0, width: 100, height: 200 }, { x: 100, y: 0, width: 150, height: 180 }]
    })
})

test('refuses oversized canvases and invalid dimensions', () => {
    assert.throws(() => layout([{ width: 10000, height: 10000 }]))
    assert.throws(() => layout([{ width: 33000, height: 1 }]))
    assert.throws(() => layout([{ width: 0, height: 10 }]))
})

test('validates complete jobs and rejects duplicate images', () => {
    const images = ['https://pbs.twimg.com/media/a?format=jpg', 'https://pbs.twimg.com/media/b?format=png']
    assert.equal(validateJob({ statusId: '123', images }).images.length, 2)
    assert.throws(() => validateJob({ statusId: '123', images: [images[0], images[0]] }))
    assert.throws(() => validateJob({ statusId: '../bad', images }))
    assert.throws(() => validateJob({ statusId: '123', images: images.slice(0, 1) }))
})

test('accepts more than four attachments and lays out all of them', () => {
    const images = Array.from({ length: 12 }, (_, index) => `https://pbs.twimg.com/media/image${index}?format=png`)
    assert.equal(validateJob({ statusId: '123', images }).images.length, 12)
    const result = layout(images.map(() => ({ width: 100, height: 200 })))
    assert.equal(result.width, 1200)
    assert.equal(result.tiles[11].x, 1100)
})
