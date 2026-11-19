#!/usr/bin/env python3
"""Builds data/network.json (normalised graph) and data/layout.json (schematic map).
Source of truth for station order and status is this file; the app only reads the JSON.
Station facts: public station lists (Wikipedia 'List of Kolkata Metro stations', line articles),
status notes cross-checked 18 Nov 2026. Geo is approximate and outlier-filtered."""
import json, math, re

def slug(n): return re.sub(r'[^a-z0-9]+','-',n.lower()).strip('-')

# name, aliases (local/former names), approximate lat,lng (None if public listing looked wrong), notes
S = {}
def st(name, aliases=(), geo=None, rail=()):
    S[slug(name)] = dict(id=slug(name), name=name, aliases=list(aliases), geo=geo, rail=list(rail))
    return slug(name)

# ---------- Blue Line (Line 1), north to south ----------
blue = [
 st("Dakshineswar",["Sri Ramakrishna"],(22.653971,88.363724)),
 st("Baranagar",["Swami Vivekananda"],(22.653529,88.378873)),
 st("Noapara",["Maa Sarada"],(22.63972,88.39389)),
 st("Dum Dum",[],(22.62111,88.39278),["Dum Dum Junction railway station"]),
 st("Belgachhia",["Belgachia"],(22.60583,88.38639)),
 st("Shyambazar",["Shyam Bazar"],(22.601313,88.372586)),
 st("Shobhabazar Sutanuti",["Hatkhola"],(22.596029,88.365285)),
 st("Girish Park",["Jorasanko"],(22.587143,88.363083)),
 st("Mahatma Gandhi Road",["Mahajati Sadan","Chittaranjan Avenue","MG Road"],(22.580858,88.361401)),
 st("Central",["Bepin Behari Ganguly Street"],(22.57247,88.358788)),
 st("Chandni Chowk",["Ganesh Chandra Avenue"],(22.566796,88.354137)),
 st("Esplanade",["Dharmatala"],(22.56444,88.35167)),
 st("Park Street",["Mother Teresa"],(22.555,88.35028)),
 st("Maidan",["Gostho Pal"],(22.54944,88.34889)),
 st("Rabindra Sadan",["Exide"],(22.54139,88.34722)),
 st("Netaji Bhavan",["Bhawanipore"],(22.53333,88.34611)),
 st("Jatin Das Park",["Hazra"],(22.524262,88.346489)),
 st("Kalighat",[],(22.516652,88.346003)),
 st("Rabindra Sarobar",["Dhakuria","Charu Market"],(22.50722,88.34556)),
 st("Mahanayak Uttam Kumar",["Tollygunge"],(22.49472,88.345)),
 st("Netaji",["Kudghat"],(22.480976,88.346)),
 st("Masterda Surya Sen",["Bansdroni"],(22.473521,88.360871)),
 st("Gitanjali",["Naktala"],None),
 st("Kavi Nazrul",["Garia Bazar"],None),
 st("Shahid Khudiram",["Dhalai Bridge","Briji"],(22.4660301,88.3915624)),
 st("Kavi Subhash",["New Garia"],(22.47194,88.39806),["New Garia railway station"]),
]
# ---------- Green Line (Line 2), west to east ----------
green = [
 st("Howrah Maidan",[],(22.581998,88.332994)),
 st("Howrah",["Howrah Station"],(22.584454,88.340578),["Howrah railway station"]),
 st("Mahakaran",[],(22.571189,88.350106)),
 "esplanade",
 st("Sealdah",[],(22.567207,88.371497),["Sealdah railway station"]),
 st("Phoolbagan",[],(22.57214,88.390282)),
 st("Salt Lake Stadium",[],(22.57306,88.40306)),
 st("Bengal Chemical",["Acharya Prafulla Chandra Ray"],(22.580076,88.401283)),
 st("City Centre",["City Center"],(22.587069,88.407875)),
 st("Central Park",[],(22.590437,88.415605)),
 st("Karunamoyee",[],(22.586435,88.421515)),
 st("Salt Lake Sector V",["Sector 5","Sector-V"],(22.581318,88.429822)),
]
# ---------- Purple Line (Line 3), south-west to north-east ----------
purple = [
 st("Joka",["Diamond Park"],(22.452244,88.301751)),
 st("Thakurpukur",[],(22.464261,88.307555)),
 st("Sakherbazar",["Silpara"],(22.474611,88.309991)),
 st("Behala Chowrasta",[],(22.487529,88.313426)),
 st("Behala Bazar",[],(22.498929,88.317354)),
 st("Taratala",["Pathakpara"],(22.508165,88.320563)),
 st("Majerhat",[],(22.5191,88.3234)),
]
# ---------- Yellow Line (Line 4), west to east ----------
yellow = [
 "noapara",
 st("Dum Dum Cantonment",[],(22.638,88.4123)),
 st("Jessore Road",[],(22.6395137,88.4297765)),
 st("Jai Hind",["Biman Bandar","Bimanbandar","Airport","Kolkata Airport"],(22.64619,88.43591)),
]
# ---------- Orange Line (Line 6), south to north ----------
orange = [
 "kavi-subhash",
 st("Satyajit Ray",["Chak Garia","Ajoy Nagar"],(22.4846,88.3926)),
 st("Jyotirindra Nandi",["Singhbari"],(22.495915,88.398667)),
 st("Kavi Sukanta",["Avishikta More"],(22.505262,88.400996)),
 st("Hemanta Mukhopadhyay",["Ruby More","Hemanta Mukherjee"],(22.514777,88.401469)),
 st("VIP Bazar",[],(22.5255,88.39586)),
 st("Ritwik Ghatak",["Bantala Road","Uttar Panchannagram"],(22.5328605,88.3957647)),
 st("Barun Sengupta",["Metropolitan","Dhapa"],None),
 st("Beleghata",["Tangra"],(22.550703,88.404094)),
]

LINES = [
 dict(id="blue",name="Blue Line",code="Line 1",color="#1F5FFF",ink="#0B2A8A",stations=blue,
      corridor="North–South",
      sections=[dict(from_="shahid-khudiram",to="kavi-subhash",status="suspended",since="2025-07-28",
        note="Blue Line platforms at Kavi Subhash have been closed since 28 July 2025 after cracks were found in supporting piers. Trains terminate at Shahid Khudiram. No reopening date had been announced as of September 2026.")]),
 dict(id="green",name="Green Line",code="Line 2",color="#0E9F5A",ink="#065F36",stations=green,corridor="East–West",sections=[]),
 dict(id="purple",name="Purple Line",code="Line 3",color="#8B3FD9",ink="#4C1D95",stations=purple,corridor="Joka–Majerhat",sections=[]),
 dict(id="yellow",name="Yellow Line",code="Line 4",color="#F2B100",ink="#7A5A00",stations=yellow,corridor="Noapara–Airport",sections=[]),
 dict(id="orange",name="Orange Line",code="Line 6",color="#F26A1B",ink="#8A3300",stations=orange,corridor="New Garia–Beleghata",sections=[]),
]
for l in LINES:
    for s in l["sections"]: s["from"]=s.pop("from_")

# interchanges
members = {}
for l in LINES:
    for sid in l["stations"]: members.setdefault(sid,[]).append(l["id"])
INTERCHANGES = []
for sid,ls in members.items():
    if len(ls)>1:
        item = dict(station=sid,lines=ls,status="open")
        if sid=="kavi-subhash":
            item["status"]="suspended"; item["since"]="2025-07-28"
            item["note"]="The Blue–Orange interchange cannot be used while the Blue Line platforms at Kavi Subhash are closed."
        INTERCHANGES.append(item)

stations=[]
for sid,s in S.items():
    d=dict(id=sid,name=s["name"],aliases=s["aliases"],lines=members[sid])
    if s["geo"]: d["geo"]=dict(lat=s["geo"][0],lng=s["geo"][1])
    if s["rail"]: d["railConnections"]=s["rail"]
    stations.append(d)

net = dict(
 schema=2,
 meta=dict(
  name="Kolkata Metro starter network",
  asOf="2026-11-18",
  summary="Operational stations and lines as listed publicly, with suspended sections flagged. Not an official feed.",
  sources=[
   "Wikipedia: List of Kolkata Metro stations (operational list, accessed 18 Nov 2026)",
   "Wikipedia: Kavi Subhash metro station and Blue Line (closure since 28 Jul 2025)",
   "kolkatametro.org Blue Line page (no reopening date announced as of Sep 2026)"],
  caveats=[
   "No live service, fares, timings or platform numbers are included.",
   "Coordinates are approximate and omitted where a public listing looked wrong.",
   "Check official Metro Railway Kolkata notices before travelling."]),
 lines=LINES, stations=stations, interchanges=INTERCHANGES)

# ----- validation -----
ids={s["id"] for s in stations}
assert len(ids)==len(stations)
for l in LINES:
    assert len(set(l["stations"]))==len(l["stations"]), l["id"]
    for sid in l["stations"]: assert sid in ids, sid
print("lines",{l["id"]:len(l["stations"]) for l in LINES},"unique stations",len(stations),"line-station entries",sum(len(l['stations']) for l in LINES))
print("interchanges",[(i["station"],i["status"]) for i in INTERCHANGES])
def hav(a,b):
    R=6371; p=math.pi/180
    x=math.sin((b[0]-a[0])*p/2)**2+math.cos(a[0]*p)*math.cos(b[0]*p)*math.sin((b[1]-a[1])*p/2)**2
    return 2*R*math.asin(math.sqrt(x))
bad=0
for l in LINES:
    prev=None
    for sid in l["stations"]:
        g=S[sid]["geo"]
        if not g: prev=None; continue
        if not(22.40<=g[0]<=22.70 and 88.28<=g[1]<=88.46): print("OUT OF BBOX",sid,g); bad+=1
        if prev and hav(prev,g)>3.6: print("GAP >3.6km",l["id"],sid,round(hav(prev,g),2)); bad+=1
        prev=g
print("geo outliers flagged:",bad)
json.dump(net,open("data/network.json","w"),indent=1,ensure_ascii=False)
print("wrote data/network.json")
