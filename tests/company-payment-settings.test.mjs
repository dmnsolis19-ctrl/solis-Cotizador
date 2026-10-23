import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});after(()=>vite.close());
const {companyFormValues,companySettingsSchema}=await vite.ssrLoadModule('/lib/company-settings.ts');
test('payment settings keep account numbers as text, validate email, and load legacy fields without overriding explicit clears',()=>{
 const form=companyFormValues({commercial_name:'Empresa de prueba',bank:'Banco antiguo',account_holder:'Titular de prueba',account_number:'000123456789',account_type:'Corriente',payment_email:'pagos@example.test',representative_role:'Ingeniero'});
 assert.equal(form.bank_name,'Banco antiguo');assert.equal(form.bank_account_number,'000123456789');assert.equal(form.representative_title,'Ingeniero');
 const stored=companySettingsSchema.parse(form);assert.equal(stored.bank_account_number,'000123456789');assert.equal(stored.bank_notification_email,'pagos@example.test');
 assert.equal(companyFormValues({bank_name:'',bank:'Banco antiguo'}).bank_name,'');
 assert.equal(companySettingsSchema.safeParse({...form,bank_notification_email:'invalid-address'}).success,false);
 assert.equal(companySettingsSchema.safeParse({...form,bank_account_number:'1'.repeat(81)}).success,false);
});
