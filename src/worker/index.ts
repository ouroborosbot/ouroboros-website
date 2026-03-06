export default {
  async fetch(request: Request, env: any): Promise<Response> {
    // Assets binding handles static files automatically
    return env.ASSETS.fetch(request);
  }
};
