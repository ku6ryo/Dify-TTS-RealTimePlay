// This code demostraets how to play audio data sent from Dify API in real-time.

import axios from 'axios'
import Speaker from 'speaker'
import ffmpeg from 'fluent-ffmpeg'
import { Readable, Stream } from 'stream'
import { config } from 'dotenv'
config()

const DIFY_API_URL = process.env.DIFY_API_URL
const DIFY_API_KEY = process.env.DIFY_API_KEY

if (!DIFY_API_URL || !DIFY_API_KEY) {
    throw new Error('DIFY_API_URL or DIFY_API_KEY are not set')
}

/**
 * This class is not doing anything.
 * It is used to expose _read() method which is not implemented in Readable.
 * If _read() is not implemented, FFmpeg will not work.
 */
class Mp3FrameReadable extends Readable {
    _read(size: number) {}
}

// Setting up input strean, FFmpeg and the speaker.
const mp3FrameStream = new Mp3FrameReadable()
const speaker = new Speaker()
ffmpeg(mp3FrameStream)
    .audioFrequency(44100)
    .audioChannels(2)
    .format('s16le')
    .pipe(speaker)


/**
 * This function process data like following:
 * data: { "event": "tts_message", "audio": "base64-data-0" }
 * 
 * data: { "event": "tts_message", "audio": "base64-data-1" }
 * ...
 * 
 * It is not a JSON but a custom format including JSONs.
 */
function jsonDataToAudioChunks(data: string) {
    const audioChunks: Buffer[] = []
    const lines = data.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.replace(/^data: /g, ''))
    for (const line of lines) {
        try {
            const json = JSON.parse(line);
            if (json['event'] === 'tts_message') {
                const audioChunk = Buffer.from(json['audio'], 'base64');
                audioChunks.push(audioChunk);
            }
        } catch (e) {
            console.error(e)
            console.error(line)
        }
    }
    return audioChunks
}

; (async function () {
    const query = "What are the specs of the iPhone 13 Pro Max?"
    const response = await axios.post<Stream>(
        DIFY_API_URL,
        {
            "inputs": {},
            "query": query,
            "response_mode": "streaming",
            "conversation_id": "",
            "user": "abc-123",
        },
        {
            headers: {
                "Authorization": `Bearer ${DIFY_API_KEY}`,
                "Content-Type": "application/json",
            },
            responseType: 'stream'
        })
    
    let packets: string[] = []
    // Remained bytes for extracting mp3 frames.
    let remainedBytes = Uint8Array.from([])
    response.data.on('data', (bytes: Buffer) => {
        // The streamed data is text data. The data is cut in a middle and sometimes full json data is not available.
        // So here, waiting \n to determine the partial json data ends at correct position.
        const strPacket = bytes.toString();
        packets.push(strPacket);
        if (strPacket.endsWith('\n')) {
            const audioChunks = jsonDataToAudioChunks(packets.join(''))
            packets = []

            // Concat audio chunks and scan the header of the mp3 frames and split into mp3 frames.
            // The remainder bytes are stored in remainedBytes for next iteration.
            // After that, push the mp3 frames into the stream.
            if (audioChunks.length > 0) {
                const binaryToProcess = Buffer.concat([remainedBytes, ...audioChunks])
                let frameStartIndex = 0
                for (let i = 0; i < binaryToProcess.length - 1; i += 1) {
                    const currentByte = binaryToProcess[i]
                    const nextByte = binaryToProcess[i + 1]
                    // MP3 frame header always starts with eleven 1 bits. Checking 2 bytes.
                    // It is a beginning of mp3 frame if current byte is 0xff and the beginning of the next byte is 111.
                    // MP3 Spacification
                    // http://www.mp3-tech.org/programmer/frame_header.html
                    if (currentByte === 0xff && (nextByte & 0b11100000) === 0b11100000) {
                        mp3FrameStream.push(binaryToProcess.subarray(frameStartIndex, i))
                        frameStartIndex = i
                    }
                }
                remainedBytes = binaryToProcess.subarray(frameStartIndex)
            }
        }
    })
    response.data.on('end', () => {
        // The remainder bytes are ensured to begin with the header of the last mp3 frame.
        if (remainedBytes.byteLength > 0) {
            mp3FrameStream.push(remainedBytes)
        }
        mp3FrameStream.push(null)
    })
    mp3FrameStream.on('data', (chunk: Buffer) => {
        // If you want to log the audio data, uncomment the following line
        // console.log(chunk)
    })
    mp3FrameStream.on('end', () => {
        console.log('MP3 stream ended')
    })
})()
