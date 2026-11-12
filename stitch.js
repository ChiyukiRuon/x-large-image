(() => {
    async function stitch(input) {
        const job = XLargeImage.validateJob(input)
        const bitmaps = []
        try {
            for (const [index, url] of job.images.entries()) {
                const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(25000) })
                if (!response.ok) throw new Error(`第 ${index + 1} 张图片获取失败（HTTP ${response.status}）`)
                if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('服务器没有返回图片')
                const blob = await response.blob()
                if (blob.size > 40 * 1024 * 1024) throw new Error('单张图片超过 40 MB')
                const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
                bitmaps.push(bitmap)
                // Check the growing result before decoding the next image.
                XLargeImage.layout(bitmaps)
            }
            const crops = bitmaps.map(bitmap => ({ left: 0, right: 0, width: bitmap.width, height: bitmap.height }))
            for (let index = 1; index < bitmaps.length; index++) {
                const left = bitmaps[index - 1]
                const right = bitmaps[index]
                const limit = Math.min(16, Math.floor(Math.min(left.width, right.width) * 0.01))
                if (limit < 1 || left.height !== right.height) continue
                const radius = limit + 1
                const strip = new OffscreenCanvas(radius * 2, left.height)
                const stripContext = strip.getContext('2d', { willReadFrequently: true })
                stripContext.drawImage(left, left.width - radius, 0, radius, left.height, 0, 0, radius, left.height)
                stripContext.drawImage(right, 0, 0, radius, right.height, radius, 0, radius, right.height)
                const columns = XLargeImage.seamColumns(stripContext.getImageData(0, 0, strip.width, strip.height), radius, limit)
                crops[index - 1].right = columns.filter(x => x < radius).length
                crops[index].left = columns.filter(x => x >= radius).length
                strip.width = 0
                strip.height = 0
            }
            const plan = XLargeImage.layout(crops.map(crop => ({ width: crop.width - crop.left - crop.right, height: crop.height })))
            const canvas = new OffscreenCanvas(plan.width, plan.height)
            const context = canvas.getContext('2d')
            if (!context) throw new Error('无法创建画布，请关闭其他标签页后重试')
            bitmaps.forEach((bitmap, index) => {
                const crop = crops[index]
                const tile = plan.tiles[index]
                context.drawImage(bitmap, crop.left, 0, tile.width, tile.height, tile.x, 0, tile.width, tile.height)
            })
            return await canvas.convertToBlob({ type: 'image/png' })
        } finally {
            bitmaps.forEach(bitmap => bitmap.close())
        }
    }
    globalThis.XLargeImage = Object.freeze({ ...XLargeImage, stitch })
})()
