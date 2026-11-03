import { z } from "zod"

const nullableText = z.string().nullish()

const person = z.object({
  name: nullableText,
  email: nullableText,
  email_domain: nullableText,
  team: nullableText,
})

export const fathomMeetingSchema = z.object({
  title: z.string().nullish(),
  meeting_title: nullableText,
  recording_id: z.union([z.number().int(), z.string().trim().min(1)]),
  url: nullableText,
  share_url: nullableText,
  created_at: z.string().nullish(),
  scheduled_start_time: nullableText,
  scheduled_end_time: nullableText,
  recording_start_time: nullableText,
  recording_end_time: nullableText,
  recorded_by: person.partial().nullish(),
  calendar_invitees: z
    .array(
      z.object({
        name: nullableText,
        email: nullableText,
      }),
    )
    .nullish(),
  default_summary: z
    .object({
      markdown_formatted: nullableText,
    })
    .nullish(),
  transcript: z
    .array(
      z.object({
        speaker: z
          .object({
            display_name: nullableText,
            matched_calendar_invitee_email: nullableText,
          })
          .nullish(),
        text: z.string().nullish(),
        timestamp: nullableText,
      }),
    )
    .nullish(),
  action_items: z
    .array(
      z.object({
        description: z.string().nullish(),
        recording_timestamp: nullableText,
        assignee: person.partial().nullish(),
      }),
    )
    .nullish(),
})

export const fathomMeetingListSchema = z.object({
  next_cursor: z.string().nullish(),
  items: z.array(fathomMeetingSchema),
})

export const fathomSummarySchema = z.object({
  summary: z
    .object({
      markdown_formatted: nullableText,
    })
    .nullish(),
})

export const fathomTranscriptSchema = z.object({
  transcript: fathomMeetingSchema.shape.transcript,
})

export type FathomMeeting = z.infer<typeof fathomMeetingSchema>
