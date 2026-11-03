export type ScheduleRow = {
  index: number
  date: string
  state: "due" | "future" | "excluded"
}
