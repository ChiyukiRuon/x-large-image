importScripts('core.js', 'seams.js', 'stitch.js')

chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'xli:download') return
    async function download() {
        const source = new URL(sender.url)
        if (sender.id !== chrome.runtime.id || source.protocol !== 'https:' || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(source.hostname)) {
            throw new Error('不支持的来源页面')
        }
        const job = XLargeImage.validateJob(message.job)
        const blob = await XLargeImage.stitch(job)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const chunks = []
        for (let offset = 0; offset < bytes.length; offset += 32768) {
            chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)))
        }
        await chrome.downloads.download({
            url: `data:image/png;base64,${btoa(chunks.join(''))}`,
            filename: `x-${job.statusId}.png`,
            saveAs: false
        })
    }
    download().then(() => respond({ ok: true }), error => respond({ error: error.message }))
    return true
})
