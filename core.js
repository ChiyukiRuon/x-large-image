(() => {
    function originalUrl(value) {
        const url = new URL(value)
        if (url.origin !== 'https://pbs.twimg.com' || !/^\/media\/[\w-]+(?:\.[a-zA-Z0-9]+)?$/.test(url.pathname)) {
            throw new Error('图片地址不是 X 原图地址')
        }
        const extension = url.pathname.match(/\.(jpg|jpeg|png|webp)$/i)
        const format = url.searchParams.get('format') || extension?.[1] || 'jpg'
        if (!['jpg', 'jpeg', 'png', 'webp'].includes(format.toLowerCase())) {
            throw new Error('暂不支持此图片格式')
        }
        return `https://pbs.twimg.com${url.pathname.replace(/\.(jpg|jpeg|png|webp)$/i, '')}?format=${format.toLowerCase()}&name=orig`
    }

    function photoLink(value) {
        try {
            const url = new URL(value, 'https://x.com')
            if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) return null
            const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)\/photo\/([1-9]\d*)\/?$/)
            if (!match || !Number.isSafeInteger(Number(match[3]))) return null
            return { author: match[1], statusId: match[2], index: Number(match[3]) }
        } catch {
            return null
        }
    }

    function validateJob(job) {
        if (!job || !/^\d+$/.test(job.statusId) || !Array.isArray(job.images) || job.images.length < 2) {
            throw new Error('请从含有至少 2 张图片的 X 帖子开始')
        }
        const images = job.images.map(originalUrl)
        if (new Set(images).size !== images.length) throw new Error('图片重复，请刷新帖子后重试')
        return { statusId: job.statusId, images }
    }

    function layout(sizes) {
        if (!sizes.length) throw new Error('没有可拼接的图片')
        if (sizes.some(({ width, height }) => !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)) {
            throw new Error('图片尺寸无效')
        }
        let offset = 0
        const tiles = sizes.map(({ width, height }) => {
            const tile = { x: offset, y: 0, width, height }
            offset += width
            return tile
        })
        const width = offset
        const height = Math.max(...tiles.map(tile => tile.height))
        if (width > 32767 || height > 32767 || width * height > 64_000_000) {
            throw new Error('拼接结果过大（上限 6400 万像素 / 单边 32767）')
        }
        return { width, height, tiles }
    }

    globalThis.XLargeImage = Object.freeze({ originalUrl, photoLink, validateJob, layout })
})()
