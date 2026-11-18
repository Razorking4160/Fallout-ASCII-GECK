/* Static host entry point. The studio has no server logic, API or database:
   every request is answered from the uploaded build in dist/. */
export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
