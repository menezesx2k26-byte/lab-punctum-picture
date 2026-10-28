// Fixed same-origin destination; token material belongs only in the cookie header.
export function clientAccessNavigation(cookie: string, browserNavigation: boolean): Response {
  void browserNavigation;
  return new Response(null, {status:303,headers:{Location:'/albuns','Set-Cookie':cookie}});
}
