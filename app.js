const KEY='cockpitGabriel.v2';
const empty=()=>({profile:{name:'Gabriel',energy:''},tasks:[],goals:[],admin:[],finance:[],jobs:[],gco:[],ideas:[],checkins:[]});
let db=load(),filter='open',module='admin',editing=null;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],iso=()=>new Date().toISOString().slice(0,10),uid=()=>crypto.randomUUID?.()||Date.now()+'-'+Math.random();
function load(){try{return {...empty(),...JSON.parse(localStorage.getItem(KEY)||'null')}}catch{return empty()}}
function save(msg=''){localStorage.setItem(KEY,JSON.stringify(db));render();if(msg)toast(msg)}