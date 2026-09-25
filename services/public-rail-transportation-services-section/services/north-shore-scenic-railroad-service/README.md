# North Shore Window

An independent, unofficial, offline-first moving field guide for North Shore
scenic rail rides from Duluth. It is not affiliated with or endorsed by the
North Shore Scenic Railroad or Lake Superior Railroad Museum and does not offer
operational train status or navigation.

The service contains the two capabilities required for this rail guide:

- TUFTE renders the calm, accessible living-interface shell.
- North Shore route matching turns device GPS into progress and uncertainty on
  this modeled rail corridor.

All route matching, trip traces, bookmarks, and narration preferences remain in
the browser. The core ride requires no account and uploads no location.

```sh
north-shore-window render > index.html
printf '{"latitude":46.81,"longitude":-92.06,"accuracy":20}' |
  north-shore-window project
```

The deployable host is the separate thin [rail-assist.561.group wrapper](../../sites/rail-assist.561.group/README.md).
