export interface ApplicationResponse<Body = unknown> {
  status: number;
  body: Body;
  headers?: Record<string, string>;
  cookies?: string[];
}
