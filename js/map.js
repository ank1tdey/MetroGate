export function renderMap(network){
 const W=920,H=610;
 const coords={
  blue:[[90,70],[90,100],[90,130],[90,160],[90,190],[90,220],[90,250],[90,280],[90,310],[90,340],[90,370],[90,400],[90,430],[90,460],[90,490],[90,520],[90,550],[90,580],[90,610],[90,640],[90,670],[90,700],[90,730],[90,760],[90,790],[90,820]],
  green:[[220,430],[260,430],[300,430],[340,430],[380,430],[420,430],[460,430],[500,430],[540,430],[580,430],[620,430],[660,430]],
  purple:[[750,100],[750,145],[750,190],[750,235],[750,280],[750,325],[750,370]],
  orange:[[500,560],[540,560],[580,560],[620,560],[660,560],[700,560],[740,560],[780,560],[820,560]],
  yellow:[[90,130],[150,130],[210,130],[270,130]]
 };
 // Re-layout map on viewBox; nodes on different lines share conceptual interchange locations via connector markers.
 const linePaths={
  blue:"M 95 70 L 95 130 L 95 190 L 95 250 L 95 310 L 95 370 L 95 430 L 95 490 L 95 550",
  green:"M 210 430 L 270 430 L 330 430 L 390 430 L 450 430 L 510 430 L 570 430 L 630 430 L 690 430 L 750 430 L 810 430 L 870 430",
  purple:"M 760 90 L 760 145 L 760 200 L 760 255 L 760 310 L 760 365 L 760 420",
  orange:"M 300 550 L 360 550 L 420 550 L 480 550 L 540 550 L 600 550 L 660 550 L 720 550 L 780 550",
  yellow:"M 95 130 L 155 130 L 215 130 L 275 130"
 };
 const pos={
 blue:[[95,55],[95,75],[95,95],[95,115],[95,135],[95,155],[95,175],[95,195],[95,215],[95,235],[95,255],[95,275],[95,295],[95,315],[95,335],[95,355],[95,375],[95,395],[95,415],[95,435],[95,455],[95,475],[95,495],[95,515],[95,535],[95,555]],
 green:[[210,430],[270,430],[330,430],[390,430],[450,430],[510,430],[570,430],[630,430],[690,430],[750,430],[810,430],[870,430]],
 purple:[[760,90],[760,145],[760,200],[760,255],[760,310],[760,365],[760,420]],
 orange:[[300,550],[360,550],[420,550],[480,550],[540,550],[600,550],[660,550],[720,550],[780,550]],
 yellow:[[95,95],[155,95],[215,95],[275,95]]
 };
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Schematic map of Kolkata Metro lines"><rect width="${W}" height="${H}" fill="#fbfaf7"/><text x="35" y="35" font-size="10" fill="#98a0a9" letter-spacing="2">NORTH</text><text x="850" y="585" font-size="10" fill="#98a0a9" letter-spacing="2">SOUTH / EAST</text>`;
 for(const l of network.lines){
  const pts=pos[l.id];const pointString=pts.map(p=>p.join(",")).join(" ");
  svg+=`<polyline points="${pointString}" fill="none" stroke="${l.color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`;
  pts.forEach((p,i)=>{
   const station=network.stations.find(s=>s.id===l.stationIds[i]);
   const label=station.name;
   const anchor=l.id==="blue"?"start":l.id==="green"?"middle":l.id==="purple"?"start":"middle";
   const tx=l.id==="blue"?p[0]+14:p[0],ty=l.id==="green"?p[1]+22:l.id==="orange"?p[1]+22:l.id==="yellow"?p[1]-14:p[1]+4;
   svg+=`<g data-station="${station.id}" style="cursor:pointer"><circle cx="${p[0]}" cy="${p[1]}" r="10" fill="#fff" stroke="${l.color}" stroke-width="4"/><circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${l.color}"/><text x="${tx}" y="${ty}" text-anchor="${anchor}" font-size="9" font-weight="600" fill="#455064">${escapeXml(label)}</text></g>`;
  });
  svg+=`<g data-line="${l.id}" style="cursor:pointer"><text x="${l.id==="blue"?125:l.id==="green"?500:l.id==="purple"?790:500}" y="${l.id==="blue"?45:l.id==="green"?400:l.id==="purple"?75:585}" font-size="12" font-weight="800" fill="${l.color}">${l.name.toUpperCase()}</text></g>`;
 }
 svg+=`<g><circle cx="95" cy="130" r="14" fill="none" stroke="#172033" stroke-width="2"/><text x="115" y="120" font-size="8" fill="#657185">NOAPARA HUB</text><circle cx="390" cy="430" r="14" fill="none" stroke="#172033" stroke-width="2"/><text x="390" y="458" text-anchor="middle" font-size="8" fill="#657185">ESPLANADE HUB</text></g>`;
 svg+=`<text x="35" y="590" font-size="9" fill="#9aa1a8">SCHEMATIC • NOT TO GEOGRAPHIC SCALE</text></svg>`;
 return svg;
}
function escapeXml(s){return String(s).replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));}
