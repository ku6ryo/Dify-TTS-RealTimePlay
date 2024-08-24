This is an example for getting TTS audio response from [Dify](https://dify.ai/) via API and playing it in real-time.

There are some sample files.

- real-time_play.ts: Plays the audio response in real-time.
- save_to_files.ts: Saves streamed audio data, response texts for each packet and concatenated text data.

The implementation details are explained in [an article](https://dev.to/ku6ryo/how-to-realize-real-time-speech-with-dify-api-4ii1) on dev.to

# How to use
Please set your API URL and API key in .env file. Please check .env.sample file for details.

Then run to play audio in real-time:
```
yarn
yarn start
```

To save responses and audio to files:
```
yarn save
```