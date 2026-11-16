/** UI-only field input rules. Backend remains the authority for validation. */
export function inputKind(field={}) {
 const name=String(field.name||'').toLowerCase();
 if(field.type==='select'||field.type==='textarea')return field.type;
 if(field.type&&field.type!=='text')return field.type;
 if(name==='email')return 'email';
 if(name==='phone')return 'tel';
 return 'text';
}
export function inputAttributes(field={}) {
 const type=inputKind(field),name=String(field.name||'').toLowerCase();
 const autocomplete= name==='currentpassword'?'current-password':
  ['newpassword','temporarypassword','password'].includes(name)?'new-password':
  name==='email'?'email':name==='phone'?'tel':undefined;
 return {type,inputMode:type==='number'?(field.step==='any'||(field.step!==undefined&&Number(field.step)%1!==0)?'decimal':'numeric'):type==='tel'?'tel':type==='email'?'email':undefined,
  autoComplete:autocomplete,spellCheck:type==='email'?false:undefined};
}
export function passwordMeetsActivationPolicy(password) {
 return typeof password==='string'&&password.length>=12&&password.length<=128&&/[A-Za-z]/.test(password)&&/[0-9]/.test(password);
}
export function passwordScore(value='') {
 const input=String(value);
 return [input.length>=12,/[A-Za-z]/.test(input)&&/[0-9]/.test(input),/[A-Z]/.test(input)&&/[a-z]/.test(input),/[^A-Za-z0-9]/.test(input)].filter(Boolean).length;
}
