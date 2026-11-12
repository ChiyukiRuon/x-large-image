(() => {
    // Only inspect a bounded strip at a known attachment boundary.
    function seamColumns({ data, width, height }, boundary, limit) {
        const uniform = x => {
            const low = [255, 255, 255, 255]
            const high = [0, 0, 0, 0]
            for (let y = 0; y < height; y++) {
                const offset = (y * width + x) * 4
                for (let c = 0; c < 4; c++) {
                    const value = c === 3 ? data[offset + c] : data[offset + c] * data[offset + 3] / 255
                    low[c] = Math.min(low[c], value)
                    high[c] = Math.max(high[c], value)
                }
            }
            return high.every((value, c) => value - low[c] <= 8)
        }
        const flat = Array.from({ length: width }, (_, x) => uniform(x))
        let start = boundary
        let end = boundary
        while (start > 0 && flat[start - 1]) start--
        while (end < width && flat[end]) end++
        // A real narrow gutter must end on both sides. Preserve broad backgrounds.
        if (end > start) {
            if (start === 0 || end === width || boundary - start > limit || end - boundary > limit) return []
            return Array.from({ length: end - start }, (_, index) => start + index)
        }

        function faded(x) {
            if (x < 1 || x >= width - 1) return false
            const sumRef = [0, 0, 0]
            const sumPixel = [0, 0, 0]
            let refSquare = 0
            let product = 0
            let continuity = 0
            let difference = 0
            for (let y = 0; y < height; y++) {
                const offset = (y * width + x) * 4
                if ([offset - 4, offset, offset + 4].some(i => data[i + 3] !== 255)) return false
                for (let c = 0; c < 3; c++) {
                    const left = data[offset - 4 + c]
                    const right = data[offset + 4 + c]
                    const ref = (left + right) / 2
                    const pixel = data[offset + c]
                    sumRef[c] += ref
                    sumPixel[c] += pixel
                    refSquare += ref * ref
                    product += ref * pixel
                    continuity += (left - right) ** 2
                    difference += (pixel - ref) ** 2
                }
            }
            const variance = refSquare - sumRef.reduce((sum, value) => sum + value * value / height, 0)
            if (variance / (height * 3) < 225 || continuity / (height * 3) > 576 || difference / (height * 3) < 36) return false
            const slope = (product - sumRef.reduce((sum, value, c) => sum + value * sumPixel[c] / height, 0)) / variance
            if (slope < 0 || slope > 0.85) return false
            const bias = sumPixel.map((value, c) => (value - slope * sumRef[c]) / height)
            if (bias.some(value => value / (1 - slope) < -12 || value / (1 - slope) > 267)) return false
            let error = 0
            for (let y = 0; y < height; y++) {
                const offset = (y * width + x) * 4
                for (let c = 0; c < 3; c++) {
                    const ref = (data[offset - 4 + c] + data[offset + 4 + c]) / 2
                    error += (data[offset + c] - slope * ref - bias[c]) ** 2
                }
            }
            return error / (height * 3) <= 25
        }
        return [boundary - 1, boundary].filter(faded)
    }

    globalThis.XLargeImage = Object.freeze({ ...XLargeImage, seamColumns })
})()
