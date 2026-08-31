export type BenchmarkSource = "top_quartile" | "organization_average";

export interface BenchmarkResult {
  value: number;
  source: BenchmarkSource;
  comparableLocationCount: number;
}
