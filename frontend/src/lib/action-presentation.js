/** AUREL navigation decisions are explicit; the button label is never parsed. */
export function actionIntent({intent='standard',icon,kind='secondary',type='button'}={}){
 if(type!=='button'||kind==='danger'||kind==='dangerGhost')return 'standard';
 return intent==='navigate'||icon==='arrowRight'?'navigate':'standard';
}
