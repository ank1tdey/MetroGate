#!/usr/bin/env python3
"""Builds data/layout.json: schematic (not geographic) coordinates for the SVG map.
Each line's drawn path is the polyline through its station coordinates, so interchange
stations (shared ids) coincide exactly. Label side codes: r l t b (t/b are rotated), lt, bc, tc."""
import json, math

P = {  # id: (x, y, labelSide)
 # Blue
 "dakshineswar":(260,90,"t"),"baranagar":(350,90,"t"),"noapara":(440,180,"l"),
 "dum-dum":(440,236,"r"),"belgachhia":(440,292,"r"),"shyambazar":(405,327,"r"),
 "shobhabazar-sutanuti":(370,362,"r"),"girish-park":(370,408,"r"),"mahatma-gandhi-road":(370,454,"r"),
 "central":(370,500,"r"),"chandni-chowk":(370,546,"r"),"esplanade":(370,592,"lt"),
 "park-street":(370,638,"r"),"maidan":(370,684,"r"),"rabindra-sadan":(370,730,"r"),
 "netaji-bhavan":(370,776,"r"),"jatin-das-park":(370,822,"r"),"kalighat":(370,868,"r"),
 "rabindra-sarobar":(370,914,"r"),"mahanayak-uttam-kumar":(370,960,"r"),
 "netaji":(400,990,"b"),"masterda-surya-sen":(470,990,"b"),"gitanjali":(540,990,"b"),
 "kavi-nazrul":(610,990,"b"),"shahid-khudiram":(680,990,"b"),"kavi-subhash":(750,990,"r"),
 # Green
 "howrah-maidan":(170,532,"tc"),"howrah":(240,532,"tc"),"mahakaran":(300,592,"bc"),
 "sealdah":(450,592,"bc"),"phoolbagan":(530,592,"bc"),"salt-lake-stadium":(590,532,"t"),
 "bengal-chemical":(660,532,"t"),"city-centre":(730,532,"t"),"central-park":(800,532,"t"),
 "karunamoyee":(870,532,"t"),"salt-lake-sector-v":(940,532,"t"),
 # Purple
 "majerhat":(270,730,"l"),"taratala":(270,782,"l"),"behala-bazar":(270,834,"l"),
 "behala-chowrasta":(270,886,"l"),"sakherbazar":(270,938,"l"),"thakurpukur":(270,990,"l"),"joka":(210,1050,"l"),
 # Yellow
 "dum-dum-cantonment":(530,180,"t"),"jessore-road":(620,180,"t"),"jai-hind":(680,120,"r"),
 # Orange
 "satyajit-ray":(750,944,"r"),"jyotirindra-nandi":(750,898,"r"),"kavi-sukanta":(750,852,"r"),
 "hemanta-mukhopadhyay":(750,806,"r"),"vip-bazar":(750,760,"r"),"ritwik-ghatak":(750,714,"r"),
 "barun-sengupta":(750,668,"r"),"beleghata":(750,622,"r"),
}
net = json.load(open("data/network.json"))
ids = {s["id"] for s in net["stations"]}
missing = ids - set(P); extra = set(P) - ids
assert not missing and not extra, (missing, extra)

lines = {}
for l in net["lines"]:
    pts = [[P[s][0], P[s][1]] for s in l["stations"]]
    at, run = {}, 0.0
    for i, s in enumerate(l["stations"]):
        if i: run += math.dist(pts[i-1], pts[i])
        at[s] = round(run, 1)
    lines[l["id"]] = dict(points=pts, at=at, length=round(run, 1))

layout = dict(
  canvas=dict(w=1100, h=1110),
  river=[[110,0],[140,200],[190,400],[270,545],[250,640],[170,780],[90,950],[50,1110]],
  stations={k: dict(x=v[0], y=v[1], side=v[2]) for k, v in P.items()},
  lines=lines)
json.dump(layout, open("data/layout.json", "w"), indent=1)
print("layout ok:", len(P), "stations,", {k: v["length"] for k, v in lines.items()})
