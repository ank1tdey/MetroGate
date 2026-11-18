import { loadNetwork } from "./data.js";
import { findRoutes } from "./router.js";
import { renderMap } from "./map.js";

const $ = (s) => document.querySelector(s);
let network, zoom=1;

function setView(view){
  document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active-view"));
  $(`#view-${view}`).classList.add("active-view");
  if(view==="map") renderNetworkMap();
}
function stationOptions(){
  const all=[...network.stations].sort((a,b)=>a.name.localeCompare(b.name));
  for(const select of [$("#from"),$("#to")]){
    for(const s of all){const o=document.createElement("option");o.value=s.id;o.textContent=`${s.name} · ${network.lines.find(l=>l.id===s.lineId).name}`;select.append(o);}
  }
}
function find(){
  const a=$("#from").value,b=$("#to").value;
  $("#results").hidden=true;
  if(!a||!b){$("#plan-message").textContent="Choose both a starting station and a destination.";return;}
  if(a===b){$("#plan-message").textContent="You're already at your destination.";return;}
  const options=findRoutes(network,a,b,4);
  if(!options.length){$("#plan-message").textContent="No verified operational connection is available in the current dataset for these stations. Check the line status and transfer notes.";return;}
  $("#plan-message").textContent="";
  $("#result-count").textContent=`${options.length} route option${options.length===1?"":"s"} found`;
  const host=$("#route-list");host.replaceChildren();
  options.forEach((route,i)=>host.append(renderRouteCard(route,i)));
  $("#results").hidden=false;
}
function renderRouteCard(route,index){
  const card=document.createElement("article");card.className="route-option"+(index===0?" recommended":"");
  const top=document.createElement("div");top.className="route-option-top";
  const num=document.createElement("span");num.className="route-number";num.textContent=`OPTION 0${index+1}`;
  top.append(num);
  if(index===0){const tag=document.createElement("span");tag.className="route-tag";tag.textContent="FEWEST TRANSFERS";top.append(tag);}
  const h=document.createElement("h3");h.textContent=route.lines.map(l=>l.name).join(" → ");
  const meta=document.createElement("p");meta.className="route-meta";meta.textContent=`${route.stations.length-1} station-to-station hops · ${route.transferCount} interchange${route.transferCount===1?"":"s"} · time not yet verified`;
  const pills=document.createElement("div");pills.className="route-lines";
  route.lines.forEach(l=>{const p=document.createElement("span");p.className="line-pill";p.style.background=l.color;p.textContent=l.name.toUpperCase();pills.append(p);});
  const stations=document.createElement("div");stations.className="route-stations";stations.textContent=route.stations.map(s=>s.name).join("  →  ");
  const details=document.createElement("details");const summary=document.createElement("summary");summary.textContent="View step-by-step instructions";details.append(summary);
  const ol=document.createElement("ol");
  route.instructions.forEach(text=>{const li=document.createElement("li");li.textContent=text;ol.append(li);});
  details.append(ol);card.append(top,h,meta,pills,stations,details);return card;
}
function renderLines(){
 const host=$("#line-grid");host.replaceChildren();
 network.lines.forEach(line=>{
  const card=document.createElement("article");card.className="line-card";
  const head=document.createElement("div");head.className="line-card-head";
  const sw=document.createElement("span");sw.className="line-swatch";sw.style.background=line.color;
  const status=document.createElement("span");status.className="line-status";status.textContent="Published corridor data";
  head.append(sw,status);
  const title=document.createElement("h3");title.textContent=line.name;
  const endpoints=document.createElement("p");endpoints.className="line-endpoints";endpoints.textContent=`${line.from} ↔ ${line.to}`;
  const count=document.createElement("div");count.className="line-count";count.textContent=line.stations.length;
  const small=document.createElement("small");small.textContent=" stations in dataset";count.append(small);
  const list=document.createElement("p");list.className="line-stations";list.textContent=line.stations.join("  ·  ");
  const note=document.createElement("p");note.className="line-stations";note.textContent=line.note;
  const btn=document.createElement("button");btn.textContent="VIEW ON NETWORK MAP";btn.addEventListener("click",()=>{setView("map");$("#map-selection").textContent=`${line.name}: ${line.stations.join(" → ")}`;});
  card.append(head,title,endpoints,count,list,note,btn);host.append(card);
 });
}
function renderNetworkMap(){
 const host=$("#network-map");host.innerHTML=renderMap(network);
 host.querySelectorAll("[data-station]").forEach(node=>node.addEventListener("click",()=>{
  const id=node.dataset.station;const s=network.stations.find(x=>x.id===id);
  $("#map-selection").textContent=`${s.name} · ${network.lines.find(l=>l.id===s.lineId).name}. Use this station as your starting point or destination in Plan Journey.`;
  $("#from").value=id;$("#to").value="";
 }));
 host.querySelectorAll("[data-line]").forEach(node=>node.addEventListener("click",()=>{
  const l=network.lines.find(x=>x.id===node.dataset.line);$("#map-selection").textContent=`${l.name}: ${l.stations.join(" → ")}`;
 }));
 $("#map-legend").replaceChildren();
 network.lines.forEach(l=>{const item=document.createElement("span");item.className="legend-item";const dot=document.createElement("i");dot.style.background=l.color;item.append(dot,document.createTextNode(l.name));$("#map-legend").append(item);});
}
$("#find").addEventListener("click",find);
$("#swap").addEventListener("click",()=>{const a=$("#from").value;$("#from").value=$("#to").value;$("#to").value=a;});
$("#clear").addEventListener("click",()=>{$("#from").value="";$("#to").value="";$("#results").hidden=true;$("#plan-message").textContent="";});
document.querySelectorAll(".nav-link").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
$("#zoom-in").addEventListener("click",()=>{zoom=Math.min(zoom+.15,1.8);$("#network-map").style.transform=`scale(${zoom})`;});
$("#zoom-out").addEventListener("click",()=>{zoom=Math.max(zoom-.15,.65);$("#network-map").style.transform=`scale(${zoom})`;});
$("#zoom-reset").addEventListener("click",()=>{zoom=1;$("#network-map").style.transform="scale(1)";});
try{network=await loadNetwork();stationOptions();renderLines();renderNetworkMap();}catch(e){console.error(e);$("#plan-message").textContent="Could not load the network dataset. Run this site through a local server.";}
