import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {visibleDom} from './browser-render.mjs';
import {safeRenderedControl} from './rendered-interactions.mjs';

test('child text resolves to its actual consent button, while nearby text stays non-interactive',()=>{
 const rect=(x,y,width,height)=>({x,y,width,height});
 const body={tagName:'BODY',parentElement:null,children:[],classList:[],innerText:'',matches:()=>false};
 const context={tagName:'DIV',parentElement:body,children:[],classList:[],innerText:'Cookie privacy consent preferences',matches:()=>false};
 body.children=[context];
 const dialog={getAttribute:name=>name==='aria-label'?'Your Privacy Settings':null};
 const button={tagName:'BUTTON',parentElement:context,children:[],classList:[],innerText:'Reject All',value:null,checked:undefined,getAttribute:()=>null,matches:selector=>selector.includes('button')&&!selector.startsWith(':disabled'),closest:()=>dialog,getBoundingClientRect:()=>rect(100,50,180,48)};
 const near={tagName:'SPAN',parentElement:context,children:[],classList:[],innerText:'Reject All',getAttribute:()=>null,matches:()=>false,closest:()=>null};
 context.children=[button,near];
 const nodes=[{textContent:'Reject All',parentElement:button},{textContent:'Reject All',parentElement:near}];
 const document={body,createTreeWalker(){let index=-1;return {nextNode(){index++;return index<nodes.length;},get currentNode(){return nodes[index];}};},createRange(){return {selectNodeContents(){},getBoundingClientRect(){return rect(310,50,68,18);}};},querySelectorAll(){return [button];},getElementById(){return null;}};
 const rows=vm.runInNewContext(`(${visibleDom.toString()})()`,{document,NodeFilter:{SHOW_TEXT:4},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1',pointerEvents:'auto',cursor:'pointer'}),scrollX:0,scrollY:0});
 const controls=rows.filter(row=>safeRenderedControl(row,'COOKIE_REJECT'));
 assert.equal(controls.length,1);assert.equal(controls[0].role,'button');assert.deepEqual([...controls[0].bboxPx],[100,50,180,48]);
 assert.equal(rows.some(row=>row.role==='button'&&row.bboxPx[2]===68),false);
 assert.equal(rows.some(row=>row.role==='span'&&row.text==='Reject All'),true);
});

test('completion intent is limited to one button inside an active consent dialog',()=>{
 const control=text=>({text,ariaLabel:text,role:'button',disabled:false,bboxPx:[1,1,80,24],consentDialogName:'Privacy Preference Center'});
 for(const text of ['Close preference center','Done','Save preferences','Confirm choices','Reject All'])assert.equal(safeRenderedControl(control(text),'COOKIE_COMPLETE'),true,text);
 for(const text of ['Subscribe now','Buy now','Open plans','Manage account','Accept All'])assert.equal(safeRenderedControl(control(text),'COOKIE_COMPLETE'),false,text);
 assert.equal(safeRenderedControl({...control('Close preference center'),consentDialogName:null},'COOKIE_COMPLETE'),false);
 assert.equal(safeRenderedControl({...control('Close preference center'),role:'span'},'COOKIE_COMPLETE'),false);
});

test('a transient document without a body exposes no clickable controls',()=>{
 const rows=vm.runInNewContext(`(${visibleDom.toString()})()`,{document:{body:null}});
 assert.deepEqual([...rows],[]);
});
