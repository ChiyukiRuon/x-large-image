import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = path.resolve(import.meta.dirname, '..')
const profile = await mkdtemp(path.join(tmpdir(), 'xli-browser-'))
const browserPath = process.env.XLI_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const fixture = `<!doctype html><html><body>
<article data-testid="tweet">
<a href="https://x.com/artist/status/123"><time>Today</time></a>
<a href="https://x.com/artist/status/123/photo/2"><img src="https://pbs.twimg.com/media/b?format=png"></a>
<a href="https://x.com/artist/status/123/photo/1"><img src="https://pbs.twimg.com/media/a?format=png"></a>
<div><a href="https://x.com/quote/status/456/photo/1"><img src="https://pbs.twimg.com/media/c?format=png"></a></div>
<div role="group"></div></article>
<script>
globalThis.importScripts = () => {}
globalThis.chrome = {
    runtime: {
        id: 'test',
        onMessage: { addListener: listener => { globalThis.listener = listener } },
        sendMessage: message => new Promise(resolve => {
            globalThis.lastJob = message.job
            listener(message, { id: 'test', url: 'https://x.com/home' }, resolve)
        })
    },
    downloads: { download: async options => { globalThis.downloads.push(options); return downloads.length } }
}
</script>
<script src="/core.js"></script><script src="/seams.js"></script><script src="/stitch.js"></script>
<script src="/background.js"></script><script src="/content.js"></script></body></html>`
const server = createServer(async (request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1)
    if (name === 'fixture') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(fixture)
        return
    }
    if (!['core.js', 'seams.js', 'stitch.js', 'background.js', 'content.js'].includes(name)) {
        response.writeHead(404).end()
        return
    }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8')
    response.end(await readFile(path.join(root, name)))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', `--user-data-dir=${profile}`], {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], windowsHide: true
})
let nextId = 0
let buffer = ''
const waiting = new Map()
browser.stdio[4].on('data', chunk => {
    buffer += chunk.toString()
    let end
    while ((end = buffer.indexOf('\0')) >= 0) {
        const message = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        const pending = waiting.get(message.id)
        if (pending) {
            waiting.delete(message.id)
            clearTimeout(pending.timer)
            if (message.error) pending.reject(new Error(JSON.stringify(message.error)))
            else pending.resolve(message.result)
        }
    }
})
browser.on('error', error => {
    for (const pending of waiting.values()) pending.reject(error)
})
function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
        const id = ++nextId
        const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15000)
        waiting.set(id, { resolve, reject, timer })
        browser.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId })}\0`)
    })
}
let session
async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session)
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
}
async function until(expression) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(expression)) return
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Condition not met: ${expression}`)
}
try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    session = (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId
    await send('Page.enable', {}, session)
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        const nativeFetch = globalThis.fetch
        globalThis.fetch = async (...args) => {
            if (!String(args[0]).startsWith('https://pbs.twimg.com/media/')) return nativeFetch(...args)
            const canvas = document.createElement('canvas')
            canvas.width = 60
            canvas.height = 80
            const context = canvas.getContext('2d')
            context.fillStyle = String(args[0]).includes('/a?') ? '#ff0000' : '#0000ff'
            context.fillRect(0, 0, 60, 80)
            if (globalThis.gutter) {
                canvas.width = 200
                canvas.height = 100
                for (let y = 0; y < 100; y++) {
                    context.fillStyle = 'rgb(' + (30 + y * 2) + ',' + (20 + y) + ',' + (80 + y) + ')'
                    context.fillRect(0, y, 200, 1)
                }
                context.fillStyle = '#ffffff'
                const first = String(args[0]).includes('/a?')
                context.fillRect(first ? 198 : 0, 0, first ? 2 : 1, 100)
            }
            return new Response(await new Promise(resolve => canvas.toBlob(resolve)), { headers: { 'Content-Type': 'image/png' } })
        }
        globalThis.downloads = []
    ` }, session)
    await send('Page.navigate', { url: `${base}/fixture` }, session)
    await until('document.querySelectorAll(".xli-stitch-button").length === 1')
    await evaluate('document.querySelector(".xli-stitch-button").click()')
    await until('downloads.length === 1 && !document.querySelector(".xli-stitch-button").disabled')
    assert.equal(await evaluate('downloads.length'), 1)
    assert.equal(await evaluate('downloads[0].filename'), 'x-123.png')
    assert.equal(await evaluate('downloads[0].saveAs'), false)
    assert.deepEqual(await evaluate(`(async () => {
        const image = await createImageBitmap(await (await fetch(downloads[0].url)).blob())
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        return [canvas.width, canvas.height, [...context.getImageData(59, 0, 2, 1).data]]
    })()`), [120, 80, [255, 0, 0, 255, 0, 0, 255, 255]])
    assert.deepEqual(await evaluate('lastJob'), {
        statusId: '123', images: ['https://pbs.twimg.com/media/a?format=png&name=orig', 'https://pbs.twimg.com/media/b?format=png&name=orig']
    })
    await evaluate(`(() => {
        const article = document.querySelector('article').cloneNode(true)
        article.querySelector('.xli-stitch-button').remove()
        document.body.append(article)
    })()`)
    await until('document.querySelectorAll(".xli-stitch-button").length === 2')
    await evaluate('globalThis.lastJob = null; document.querySelectorAll(".xli-stitch-button")[1].click()')
    await until('downloads.length === 2 && !document.querySelectorAll(".xli-stitch-button")[1].disabled')
    await evaluate('globalThis.gutter = true; document.querySelector(".xli-stitch-button").click()')
    await until('downloads.length === 3 && !document.querySelector(".xli-stitch-button").disabled')
    assert.deepEqual(await evaluate(`(async () => {
        const image = await createImageBitmap(await (await fetch(downloads[2].url)).blob())
        const canvas = new OffscreenCanvas(image.width, image.height)
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        return [image.width, image.height, [...context.getImageData(197, 50, 2, 1).data]]
    })()`), [397, 100, [130, 70, 130, 255, 130, 70, 130, 255]])
    await evaluate(`(() => {
        globalThis.gutter = false
        const article = document.querySelector('article')
        for (let index = 12; index >= 3; index--) {
            const link = document.createElement('a')
            link.href = 'https://x.com/artist/status/123/photo/' + index
            const image = document.createElement('img')
            image.src = 'https://pbs.twimg.com/media/image' + index + '?format=png'
            link.append(image)
            article.append(link)
        }
        article.querySelector('.xli-stitch-button').click()
    })()`)
    await until('downloads.length === 4 && !document.querySelector(".xli-stitch-button").disabled')
    assert.equal(await evaluate('lastJob.images.length'), 12)
    assert.equal(await evaluate('lastJob.images[9]'), 'https://pbs.twimg.com/media/image10?format=png&name=orig')
    assert.deepEqual(await evaluate(`(async () => {
        const image = await createImageBitmap(await (await fetch(downloads[3].url)).blob())
        return [image.width, image.height]
    })()`), [720, 80])
    await evaluate(`globalThis.fetch = async () => { throw new Error('Network failure') }; document.querySelector('.xli-stitch-button').click()`)
    await until('document.querySelector(".xli-stitch-button").title === "Network failure"')
    assert.equal(await evaluate('downloads.length'), 4)
    assert.equal(await evaluate('document.querySelector(".xli-stitch-button").disabled'), false)
    console.log('PASS: one-click download, PNG pixels, automatic seam removal, filename, attachment order, quoted media exclusion, dynamic articles, failure without partial download')
} finally {
    await send('Browser.close').catch(() => browser.kill())
    server.close()
    for (const pending of waiting.values()) clearTimeout(pending.timer)
    // Only remove the fresh profile under the OS temporary directory.
    const resolved = path.resolve(profile)
    if (path.dirname(resolved) === path.resolve(tmpdir()) && path.basename(resolved).startsWith('xli-browser-')) {
        await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
    }
}
