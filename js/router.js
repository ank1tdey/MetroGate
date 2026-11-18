export function findRoutes(network,start,destination,limit=4){
 const graph=new Map(network.stations.map(s=>[s.id,[]]));
 for(const e of network.connections){if(e.status!=="operational")continue;
  graph.get(e.from).push({to:e.to,type:"ride",lineId:e.lineId,direction:e.directionForward});
  graph.get(e.to).push({to:e.from,type:"ride",lineId:e.lineId,direction:e.directionReverse});
 }
 for(const t of network.transfers){if(t.status!=="operational")continue;
  graph.get(t.stationA).push({to:t.stationB,type:"transfer",transferId:t.id});
  graph.get(t.stationB).push({to:t.stationA,type:"transfer",transferId:t.id});
 }
 const stationById=new Map(network.stations.map(s=>[s.id,s]));
 const lineById=new Map(network.lines.map(l=>[l.id,l]));
 const paths=[];const maxDepth=network.stations.length;
 function dfs(current,path,edges,visited){
  if(paths.length>=80)return;
  if(current===destination){paths.push({ids:[...path],edges:[...edges]});return;}
  if(path.length>maxDepth)return;
  for(const edge of graph.get(current)||[]){
   if(visited.has(edge.to))continue;
   visited.add(edge.to);path.push(edge.to);edges.push(edge);
   dfs(edge.to,path,edges,visited);
   edges.pop();path.pop();visited.delete(edge.to);
  }
 }
 dfs(start,[start],[],new Set([start]));
 const results=paths.map(p=>{
  const stations=p.ids.map(id=>stationById.get(id));
  const rideEdges=p.edges.filter(e=>e.type==="ride");
  const transfers=p.edges.filter(e=>e.type==="transfer");
  const lineIds=[];for(const e of rideEdges)if(!lineIds.includes(e.lineId))lineIds.push(e.lineId);
  const lines=lineIds.map(id=>lineById.get(id));
  const instructions=[];
  let currentLine=null;
  p.edges.forEach((e,i)=>{
   if(e.type==="transfer"){
    const nextRide=p.edges.slice(i+1).find(x=>x.type==="ride");
    const nextLine=nextRide?lineById.get(nextRide.lineId):null;
    instructions.push(`At ${stations[i].name}, change to ${nextLine?.name||"the connecting line"}. Follow station signs; exact walking directions are not yet verified.`);
   }else if(e.lineId!==currentLine){
    currentLine=e.lineId;
    const line=lineById.get(e.lineId);
    instructions.push(`Board ${line.name} ${e.direction}.`);
   }else{
    instructions.push(`Continue to ${stations[i+1].name}.`);
   }
  });
  return {stations,lines,transferCount:transfers.length,instructions,hopCount:rideEdges.length};
 });
 // Keep distinct line sequences and rank by transfers first, then number of ride hops.
 const unique=new Map();
 for(const r of results){const key=r.stations.map(s=>s.id).join("|");if(!unique.has(key))unique.set(key,r);}
 return [...unique.values()].sort((a,b)=>a.transferCount-b.transferCount||a.hopCount-b.hopCount).slice(0,limit);
}