export const NORTH_SHORE_ROUTE = Object.freeze({
  id: "north-shore-duluth-northwoods",
  name: "Duluth to the Northwoods",
  description: "A rider-side route model for the Northwoods Explorer corridor. The train's actual turnaround is detected from the rider's motion, not assumed.",
  geometrySource: {
    name: "OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    observedAt: "2026-08-09"
  },
  officialSource: "https://duluthtrains.com/about/",
  coordinates: Object.freeze([
    [-92.1059583,46.7780968],[-92.1021026,46.7811863],[-92.0974343,46.7853858],[-92.0952044,46.7875738],
    [-92.0949236,46.7878234],[-92.0912502,46.7908889],[-92.0890728,46.79351],[-92.0854368,46.7957909],
    [-92.0818896,46.7972529],[-92.0765388,46.7990368],[-92.0662432,46.8041989],[-92.0618818,46.8067445],
    [-92.0602186,46.8095593],[-92.0599064,46.8101889],[-92.0568631,46.8132289],[-92.0543203,46.8151427],
    [-92.0536942,46.8156215],[-92.0493282,46.8189225],[-92.0491535,46.8190587],[-92.0423033,46.8231537],
    [-92.0327546,46.827056],[-92.0283763,46.8294449],[-92.0185323,46.8348192],[-92.014194,46.8362628],
    [-92.007094,46.8383479],[-92.0064702,46.8385392],[-91.9998183,46.8407858],[-91.9807491,46.8539421],
    [-91.9331584,46.8799305],[-91.9198042,46.8871977],[-91.9192924,46.8874789],[-91.8978028,46.9004758],
    [-91.8969018,46.9012876],[-91.8966121,46.9015444],[-91.8898132,46.9066351],[-91.8892343,46.9069253],
    [-91.857365,46.921696],[-91.8516353,46.9241735],[-91.8506767,46.9246108],[-91.8387066,46.9280618],
    [-91.8366018,46.9286117],[-91.8352659,46.9289462],[-91.8207209,46.9296034],[-91.8137828,46.9306868],
    [-91.8008325,46.9392612],[-91.7932367,46.9420292],[-91.7927146,46.9422087],[-91.7818314,46.9487731],
    [-91.7814444,46.9492612]
  ]),
  points: Object.freeze([
    {id:"depot",name:"Duluth Depot",eyebrow:"The journey begins",coordinate:[-92.1059583,46.7780968],side:"center",story:"The historic depot is the excursion's home platform. Use the railroad's official site for boarding, accessibility, and schedule information.",sourceName:"North Shore Scenic Railroad",sourceUrl:"https://duluthtrains.com/"},
    {id:"harbor",name:"Harbor & downtown",eyebrow:"City meets lake",coordinate:[-92.1021026,46.7811863],side:"lake",story:"The track threads through downtown Duluth before settling alongside Lake Superior. Watch the city open toward the harbor.",sourceName:"Official route history",sourceUrl:"https://duluthtrains.com/about/"},
    {id:"brewery-creek",name:"Brewery Creek & Fitger's",eyebrow:"Water under the city",coordinate:[-92.0974343,46.7853858],side:"land",story:"Brewery Creek descends through the hillside near the former brewery district—one of many streams the railway crosses on its way north.",sourceName:"Official route history",sourceUrl:"https://duluthtrains.com/about/"},
    {id:"leif-erikson",name:"Leif Erikson Park",eyebrow:"Look lake-side",coordinate:[-92.0890728,46.79351],side:"lake",story:"The shoreline parks and Lakewalk appear between the train and the open water. This is an early wide view of Lake Superior.",sourceName:"Official photography guide",sourceUrl:"https://duluthtrains.com/photography/"},
    {id:"congdon",name:"Historic Congdon",eyebrow:"City to woodland",coordinate:[-92.0662432,46.8041989],side:"land",story:"The route leaves the downtown waterfront for the wooded Congdon corridor, where short tunnels, cuts, and creek crossings begin to shape the ride.",sourceName:"Northwoods Explorer description",sourceUrl:"https://duluthtrains.com/excursions/"},
    {id:"northwoods",name:"The Northwoods",eyebrow:"Bridges ahead",coordinate:[-92.0423033,46.8231537],side:"center",story:"The railroad describes this stretch as Northwoods scenery with streams and bridges rising more than fifty feet above the water below.",sourceName:"Northwoods Explorer description",sourceUrl:"https://duluthtrains.com/excursions/"},
    {id:"lester-river",name:"Lester River corridor",eyebrow:"Look lake-side",coordinate:[-92.007094,46.8383479],side:"lake",story:"At the eastern edge of Duluth, the line reaches the Lester River corridor and the city begins to fall behind.",sourceName:"Official route history",sourceUrl:"https://duluthtrains.com/about/"},
    {id:"lakewood",name:"Lakewood Road country",eyebrow:"Open shoreline",coordinate:[-91.9807491,46.8539421],side:"lake",story:"Beyond Lakeside, road crossings thin out and the railway alternates between forest, stream valleys, and glimpses of the lake.",sourceName:"Official railroad track chart",sourceUrl:"https://duluthtrains.com/about/"},
    {id:"mcquade",name:"McQuade Road",eyebrow:"Eleven miles from Duluth",coordinate:[-91.9331584,46.8799305],side:"center",story:"The railroad's public milepost list places McQuade Road around mile 11.4—useful evidence that the city is now well behind the train.",sourceName:"Official railroad track chart",sourceUrl:"https://duluthtrains.com/about/"},
    {id:"french-river",name:"French River country",eyebrow:"Water shapes the route",coordinate:[-91.8969018,46.9012876],side:"lake",story:"French River is one of the named North Shore watersheds in the railroad's route history. The track follows the same lakeward drainage pattern as the highway and shoreline settlements.",sourceName:"Official route history",sourceUrl:"https://duluthtrains.com/about/"},
    {id:"homestead",name:"Homestead Road",eyebrow:"Deep into the excursion",coordinate:[-91.857365,46.921696],side:"center",story:"The public track chart places Homestead Road near mile 15.9. The Northwoods Explorer may reverse at a siding; this app waits for your actual motion before declaring the return.",sourceName:"Official railroad track chart",sourceUrl:"https://duluthtrains.com/about/"},
    {id:"toms-logging",name:"Tom's Logging Camp",eyebrow:"North Shore memory",coordinate:[-91.8366018,46.9286117],side:"land",story:"The railroad's public chart marks Tom's Logging Camp near mile 16.9, a reminder of the logging history carried in the landscape and place names.",sourceName:"Official railroad track chart",sourceUrl:"https://duluthtrains.com/about/"}
  ])
});
