import {
  MediaConvertClient,
  CreateJobCommand,
  GetJobCommand,
  type CreateJobCommandInput,
} from '@aws-sdk/client-mediaconvert'

// MediaConvert endpoint for us-east-1 (account-specific)
let MEDIACONVERT_ENDPOINT = process.env.MEDIACONVERT_ENDPOINT!
let MEDIACONVERT_ROLE_ARN = process.env.MEDIACONVERT_ROLE_ARN!

let client = new MediaConvertClient({ endpoint: MEDIACONVERT_ENDPOINT })

interface ConvertEvent {
  action?: 'convert' | 'status'
  bucket?: string
  key?: string
  outputKey?: string
  jobId?: string
}

interface ConvertResult {
  statusCode: number
  body: string
}

export async function handler(event: ConvertEvent): Promise<ConvertResult> {
  // Route to appropriate handler based on action
  if (event.action === 'status') {
    return getJobStatus(event.jobId)
  }
  return createConvertJob(event)
}

async function getJobStatus(jobId: string | undefined): Promise<ConvertResult> {
  if (!jobId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing jobId parameter' }),
    }
  }

  try {
    let command = new GetJobCommand({ Id: jobId })
    let response = await client.send(command)
    let job = response.Job

    return {
      statusCode: 200,
      body: JSON.stringify({
        jobId: job?.Id,
        status: job?.Status,
        percentComplete: job?.JobPercentComplete,
        errorMessage: job?.ErrorMessage,
        createdAt: job?.CreatedAt?.toISOString(),
      }),
    }
  } catch (error) {
    console.error('GetJob failed:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to get job status',
      }),
    }
  }
}

async function createConvertJob(event: ConvertEvent): Promise<ConvertResult> {
  let { bucket, key, outputKey } = event

  if (!bucket || !key || !outputKey) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required parameters: bucket, key, outputKey' }),
    }
  }

  // Remove file extension from outputKey for MediaConvert (it adds its own)
  let outputKeyWithoutExt = outputKey.replace(/\.[^.]+$/, '')
  // Get the directory path for the output
  let outputDir = outputKeyWithoutExt.substring(0, outputKeyWithoutExt.lastIndexOf('/') + 1)

  let jobSettings: CreateJobCommandInput = {
    Role: MEDIACONVERT_ROLE_ARN,
    Settings: {
      Inputs: [
        {
          FileInput: `s3://${bucket}/${key}`,
          AudioSelectors: {
            'Audio Selector 1': {
              DefaultSelection: 'DEFAULT',
            },
          },
          VideoSelector: {},
          TimecodeSource: 'ZEROBASED',
        },
      ],
      OutputGroups: [
        {
          Name: 'WebM Output',
          OutputGroupSettings: {
            Type: 'FILE_GROUP_SETTINGS',
            FileGroupSettings: {
              Destination: `s3://${bucket}/${outputDir}`,
            },
          },
          Outputs: [
            {
              NameModifier: outputKeyWithoutExt.substring(outputKeyWithoutExt.lastIndexOf('/') + 1),
              ContainerSettings: {
                Container: 'WEBM',
              },
              VideoDescription: {
                CodecSettings: {
                  Codec: 'VP9',
                  Vp9Settings: {
                    RateControlMode: 'VBR',
                    QualityTuningLevel: 'MULTI_PASS_HQ',
                    Bitrate: 3000000, // 3 Mbps target
                    MaxBitrate: 5000000, // 5 Mbps max
                    GopSize: 90,
                    GopSizeUnits: 'FRAMES',
                  },
                },
                // Preserve source dimensions by not specifying width/height
              },
              AudioDescriptions: [
                {
                  CodecSettings: {
                    Codec: 'OPUS',
                    OpusSettings: {
                      Bitrate: 128000, // 128 kbps
                      Channels: 2,
                      SampleRate: 48000,
                    },
                  },
                  AudioSourceName: 'Audio Selector 1',
                },
              ],
            },
          ],
        },
      ],
      TimecodeConfig: {
        Source: 'ZEROBASED',
      },
    },
  }

  try {
    let command = new CreateJobCommand(jobSettings)
    let response = await client.send(command)

    return {
      statusCode: 200,
      body: JSON.stringify({
        jobId: response.Job?.Id,
        status: response.Job?.Status,
        outputKey: outputKeyWithoutExt + '.webm',
      }),
    }
  } catch (error) {
    console.error('MediaConvert job creation failed:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to create MediaConvert job',
      }),
    }
  }
}
