'use strict';
const fs=require('node:fs');
const path=require('node:path');
// Bundle the real cover locally so mandatory updates still work when ERP is offline.
const root=path.resolve(__dirname,'..');
const target=path.join(__dirname,'assets','cover-assets');
fs.mkdirSync(target,{recursive:true});
for(const name of ['tide-cover.css','typography.css','headline-motion.css','app-flow-theme.css','tide.js','regular.otf','bold.otf','Pretendard-LICENSE.txt','erp-startup.css','erp-startup.js']){
 fs.copyFileSync(path.join(root,'cover-assets',name),path.join(target,name));
}
let html=fs.readFileSync(path.join(root,'cover.html'),'utf8');
html=html.replace('<body class="c1">','<body class="c1" data-desktop-startup="true">')
 .replaceAll('href="/cover-assets/','href="cover-assets/')
 .replace('</head>','<link rel="stylesheet" href="update.css"></head>');
fs.writeFileSync(path.join(__dirname,'assets','index.html'),html);
