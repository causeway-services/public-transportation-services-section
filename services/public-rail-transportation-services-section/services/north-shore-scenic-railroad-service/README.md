# North Shore Window

An independent, unofficial, offline-first moving field guide for North Shore
scenic rail rides from Duluth. It is not affiliated with or endorsed by the
North Shore Scenic Railroad or Lake Superior Railroad Museum and does not offer
operational train status or navigation.

The service composes two ordinary engineering capabilities:

- TUFTE renders the calm, accessible living-interface shell.
- Route position projection turns device GPS into progress and uncertainty.

All route matching, trip traces, bookmarks, and narration preferences remain in
the browser. The core ride requires no account and uploads no location.

```sh
north-shore-window render > index.html
printf '{"latitude":46.81,"longitude":-92.06,"accuracy":20}' |
  north-shore-window project
```

The deployable host is a separate thin wrapper in [public publishing](../../../../../../../public-publishing-services-section/services/public-computer-publishing-services-section/services/public-system-computer-publishing-section/services/public-web-publishing-services-section/sites/north-shore-scenic-railroad-service.561.group/README.md).
