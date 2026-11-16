/** In-memory local login protection. Successful logins must not count as failures. */
import {fail} from './domain.js';
export class LoginThrottle{
 constructor({limit=12,windowMs=15*60*1000,maxKeys=2000}={}){
  this.limit=limit;this.windowMs=windowMs;this.maxKeys=maxKeys;this.failures=new Map();
 }
 recent(key,now){
  const records=(this.failures.get(key)||[]).filter(timestamp=>now>=timestamp&&now-timestamp<this.windowMs);
  if(records.length)this.failures.set(key,records);else this.failures.delete(key);
  return records;
 }
 assertAllowed(key,now=Date.now()){
  if(this.recent(key,now).length>=this.limit)fail('Quá nhiều lần đăng nhập sai. Hãy thử lại sau.',429);
 }
 recordFailure(key,now=Date.now()){
  const failures=this.recent(key,now);
  if(this.failures.size>=this.maxKeys&&!this.failures.has(key)){
   // Reap stale keys first; eviction keeps memory bounded even under rotating IPs.
   for(const candidate of this.failures.keys())this.recent(candidate,now);
   if(this.failures.size>=this.maxKeys)this.failures.delete(this.failures.keys().next().value);
  }
  this.failures.set(key,[...failures,now]);
 }
 clear(key){this.failures.delete(key)}
}
