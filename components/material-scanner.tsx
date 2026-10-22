"use client";
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
type Detector={detect(source:HTMLVideoElement):Promise<Array<{rawValue:string}>>};
type DetectorType={new(options:{formats:string[]}):Detector;getSupportedFormats():Promise<string[]>};
export function MaterialScanner({onCode}:{onCode(code:string):void}){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),generation=useRef({value:0}),callback=useRef(onCode);
 const [running,setRunning]=useState(false),[starting,setStarting]=useState(false),[error,setError]=useState(''),[manual,setManual]=useState('');
 useEffect(()=>{callback.current=onCode;},[onCode]);
 const release=()=>{generation.current.value++;if(timer.current)clearTimeout(timer.current);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(video.current)video.current.srcObject=null;};
 useEffect(()=>{const token=generation.current;const hide=()=>{if(document.hidden){generation.current.value++;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;setRunning(false);setStarting(false);}};document.addEventListener('visibilitychange',hide);return()=>{document.removeEventListener('visibilitychange',hide);token.value++;if(timer.current)clearTimeout(timer.current);stream.current?.getTracks().forEach(track=>track.stop());};},[]);
 const stop=()=>{release();setRunning(false);setStarting(false);};
 const start=async()=>{
  if(starting||running)return;setStarting(true);setError('');const id=++generation.current.value;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('La cámara requiere HTTPS y permiso del navegador. Puede usar el código escrito o un lector externo.');
   const native=(globalThis as unknown as {BarcodeDetector?:DetectorType}).BarcodeDetector;let detector:Detector|undefined;
   if(native){try{const formats=(await native.getSupportedFormats()).filter(format=>['qr_code','code_128','ean_13','ean_8','upc_a','upc_e'].includes(format));if(formats.length)detector=new native({formats});}catch{/* QR fallback remains available when the native detector is unavailable. */}}
   const imported=await import('@/vendor/jsqr.mjs');const decode=imported.default as unknown as (data:Uint8ClampedArray,width:number,height:number)=>{data:string}|null;
   const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
   if(generation.current.value!==id){media.getTracks().forEach(track=>track.stop());return;}stream.current=media;
   if(!video.current)throw Error('No fue posible abrir la vista de cámara.');video.current.srcObject=media;await video.current.play();if(generation.current.value!==id)return;
   setRunning(true);setStarting(false);const canvas=document.createElement('canvas');const context=canvas.getContext('2d',{willReadFrequently:true});
   const scan=async()=>{if(generation.current.value!==id||!video.current)return;const source=video.current;let value='';try{
    if(source.readyState>=2&&source.videoWidth){if(detector){try{value=(await detector.detect(source))[0]?.rawValue||'';}catch{detector=undefined;}}
     if(!value&&context){const scale=Math.min(1,800/source.videoWidth);canvas.width=Math.round(source.videoWidth*scale);canvas.height=Math.round(source.videoHeight*scale);context.drawImage(source,0,0,canvas.width,canvas.height);const frame=context.getImageData(0,0,canvas.width,canvas.height);value=decode(frame.data,canvas.width,canvas.height)?.data||'';}
    }
    if(generation.current.value!==id)return;if(value){stop();callback.current(value);return;}
   }catch{/* Wait for the next frame; partially initialized frames are common on mobile. */}if(generation.current.value===id)timer.current=setTimeout(()=>void scan(),300);};void scan();
  }catch(e){if(generation.current.value===id){release();setRunning(false);setStarting(false);setError(e instanceof Error?e.message:'No se pudo iniciar la cámara.');}}
 };
 return <div className="space-y-3 rounded-xl border bg-slate-50 p-4"><h3 className="font-semibold">Escanear material</h3><p className="text-xs text-slate-600">El escaneo selecciona el material; confirme la cantidad antes de agregarla al lote. QR incluye lector de respaldo. Las barras por cámara dependen del dispositivo; también puede usar lector USB/Bluetooth o escribir el código.</p>
 <video ref={video} muted playsInline className={running?'aspect-video w-full rounded-lg bg-black object-cover':'hidden'} aria-label="Vista de cámara para leer material" />
 <div className="flex flex-wrap gap-2">{running||starting?<Button variant="outline" onClick={stop}>Detener cámara</Button>:<Button variant="outline" onClick={()=>void start()}>Abrir cámara</Button>}</div>{starting&&<p role="status" className="text-xs">Iniciando cámara…</p>}{error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
 <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();if(manual.trim()){stop();onCode(manual.trim());setManual('');}}}><Input className="min-w-0 flex-1" aria-label="Código leído o escrito" placeholder="Código, QR SOLIS o lector externo" value={manual} autoCapitalize="none" autoCorrect="off" onChange={e=>setManual(e.target.value)} maxLength={200}/><Button type="submit" variant="outline" disabled={!manual.trim()}>Buscar código</Button></form></div>;
}
