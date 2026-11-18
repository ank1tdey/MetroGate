export async function loadNetwork(){
 const response=await fetch(new URL("../data/network.json",import.meta.url));
 if(!response.ok)throw new Error("Network data failed to load.");
 const data=await response.json();
 const ids=new Set(data.stations.map(s=>s.id));
 if(ids.size!==data.stations.length)throw new Error("Duplicate station IDs in network data.");
 for(const edge of data.connections){if(!ids.has(edge.from)||!ids.has(edge.to))throw new Error("Invalid connection endpoint.");}
 for(const t of data.transfers){if(!ids.has(t.stationA)||!ids.has(t.stationB))throw new Error("Invalid transfer endpoint.");}
 return data;
}