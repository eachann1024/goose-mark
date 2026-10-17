import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('png')
Config.setOverwriteOutput(true)
Config.setPixelFormat('yuv420p')
Config.setCodec('h264')
Config.setCrf(18)
Config.setChromiumOpenGlRenderer('angle')
