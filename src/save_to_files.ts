import axios from 'axios'
import { writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import path from 'path'
import { config } from 'dotenv'
config()

const DIFY_API_URL = process.env.DIFY_API_URL
const DIFY_API_KEY = process.env.DIFY_API_KEY

if (!DIFY_API_URL || !DIFY_API_KEY) {
    throw new Error('DIFY_API_URL or DIFY_API_KEY are not set')
}

const OUT_DIR = path.join(__dirname, '../out')

if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR)
}

// Rmove all files in the out directory.
for (const file of readdirSync(OUT_DIR)) {
    unlinkSync(path.join(OUT_DIR, file))
}

;(async function () {
    const query = "What are the specs of the iPhone 13 Pro Max?"
    const response = await axios.post(
        DIFY_API_URL,
        {
            "inputs": {},
            "query": query,
            "response_mode": "streaming",
            "conversation_id": "",
            "user": "abc-123",
            "files": []
        },
        {
            headers: {
                "Authorization":`Bearer ${DIFY_API_KEY}`,
                "Content-Type": "application/json",
            },
            responseType: 'stream'
        });

    const jsonChunks: string[] = []

    let i = 0
    // Collect data and store it in the JSON chunks array.
    response.data.on('data', (chunk: Buffer) => {
        const stringifiedChunk = chunk.toString();
        jsonChunks.push(stringifiedChunk);
        writeFileSync(path.join(OUT_DIR, `response-${i}.txt`), stringifiedChunk);
        i++
    });

    response.data.on('end', () => {
        // Concat text data and create JSON lines.
        const fullJson = jsonChunks.join('');
        const lines = fullJson.split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.replace(/^data: /g, ''))

        // Parse each JSON line and convert it to audio chunks when the line contains an audio data.
        const audioChunks: Buffer[] = []
        for (const line of lines) {
            const json = JSON.parse(line);
            if (json['event'] === 'tts_message') {
                const audioChunk = Buffer.from(json['audio'], 'base64')
                audioChunks.push(audioChunk)
            }
        }
        // Save audio chunks to a file.
        const audioBuffer = Buffer.concat(audioChunks)
        writeFileSync(path.join(OUT_DIR, 'audio.mp3'), audioBuffer)
        writeFileSync(path.join(OUT_DIR, 'response.txt'), fullJson)
    })
})()
