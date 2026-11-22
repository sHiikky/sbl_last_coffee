const { createClient } = require('@supabase/supabase-js');

const identifier = 'custom:yandex-id';
const providerConfig = {
  name: 'Яндекс ID',
  client_id: process.env.YANDEX_CLIENT_ID,
  client_secret: process.env.YANDEX_CLIENT_SECRET,
  authorization_url: 'https://oauth.yandex.ru/authorize',
  token_url: 'https://oauth.yandex.ru/token',
  // Supabase needs OIDC-style claims (sub/name); this adapter converts Yandex's id/real_name.
  userinfo_url: `${process.env.SUPABASE_URL}/functions/v1/yandex-userinfo`,
  scopes: ['login:info'],
  email_optional: true,
};

async function main() {
  if (!providerConfig.client_id || !providerConfig.client_secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Не заданы обязательные значения. Запусти configure-yandex-provider.ps1.');
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: list, error: listError } = await supabase.auth.admin.customProviders.listProviders();
  if (listError) throw listError;

  const existing = list.providers.find((provider) => provider.identifier === identifier);
  let result;
  if (existing) {
    if (existing.provider_type !== 'oauth2') {
      throw new Error(`Провайдер ${identifier} уже существует не как OAuth2; он не изменён.`);
    }
    result = await supabase.auth.admin.customProviders.updateProvider(identifier, providerConfig);
  } else {
    result = await supabase.auth.admin.customProviders.createProvider({
      provider_type: 'oauth2',
      identifier,
      ...providerConfig,
    });
  }

  if (result.error) throw result.error;
  console.log(`Готово: ${identifier} ${existing ? 'обновлён' : 'создан'} как OAuth2.`);
}

main().catch((error) => {
  // Deliberately print only the message; never dump request/config objects.
  console.error(`Ошибка настройки: ${error.message || 'неизвестная ошибка'}`);
  process.exitCode = 1;
});
