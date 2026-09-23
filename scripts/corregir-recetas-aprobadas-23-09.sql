-- =============================================================================
-- Correcciones de recetas aprobadas por Javier (22/09) y Cesar (23/09/2026)
-- =============================================================================
--
-- Que hace:
--   1. Copia TODAS las lineas que va a tocar a respaldo_recetas_20260923, enteras,
--      incluidas las que borra. Deshacer es volver a copiar de ahi.
--   2. Corrige 106 cantidades:
--        19 de la planilla del 22/09 (la coma corrida) mas la serie de la
--           lentejuela pegada que dejo Cesar el 23/09, identica en los dos colores;
--        87 huecos del 23/09: tallas de nino que estaban en cero y si llevan.
--   3. Borra 47 lineas de tallas TAD y TS de prendas de nino. Cesar: "no existe
--      talla S o AD para nino(a), se debe eliminar".
--
-- Que NO hace:
--   - El elastico de la mariposa (PRDM0017 T14): ya estaba en 0,52.
--   - Los 2 del Sonic (PRM0157 T16, polar y polinam): los valores parecen
--     cruzados entre los dos materiales. Quedan hasta que confirmen.
--   - Las 491 lineas en cero en todas las tallas: Cesar pidio dejarlas, todavia
--     no tienen los consumos medidos.
--   - Las VARIANTES TAD/TS de productos de nino. Solo se borran lineas de
--     receta; los SKU quedan, porque 46 de ellos tienen stock.
--
-- Candados:
--   Cada UPDATE exige que la cantidad siga siendo la que era cuando se armo
--   la lista, y cada DELETE exige que siga en cero. Si alguien la toco desde
--   entonces, esa linea no se pisa y aparece en la verificacion del final.
--
-- Todo va en una transaccion: o entra completo o no entra nada.
-- =============================================================================

begin;

-- 1) Respaldo ------------------------------------------------------------------
create table if not exists respaldo_recetas_20260923 as
  select now() as respaldado_en, rl.* from recetas_lineas rl where false;

insert into respaldo_recetas_20260923
select now(), rl.* from recetas_lineas rl
where rl.id in (
  '36feccb9-09b4-4133-9122-101dcd4cfc55',
  '12074b53-b06a-4be7-a746-4a27e10ff0f6',
  'adc7faa4-0e38-4776-a777-e105d5b281bf',
  'a51ceaf3-9e72-4970-bef2-2d9e8bec7121',
  '9e6802b3-3756-49de-9c90-14aa89937194',
  '831c5ad6-6ec8-4183-86b1-20578c10159e',
  '4a010ff3-dc0f-46b2-ae4f-acdacf89ac55',
  '13991215-c4bf-436b-a480-5e9794a8b790',
  '641c2cb8-f547-4f92-9dc9-66aae3de5a5b',
  '33e58114-0839-4613-9cb8-c73d4b88d6e8',
  '202f536c-66d9-4077-8c25-c5addb62163d',
  '032883da-c358-478c-b89d-6031d1282298',
  'b315b2a3-26f0-43d1-b42f-1528b6a10834',
  'dcb53810-66c9-4d65-8598-eea44cf12c50',
  '80789a08-def7-41c7-a483-c0425f020f17',
  '05bc4332-c91f-49b2-aadf-5cfbe612c6d0',
  'c972a4f0-961a-44a8-916a-a78df23ec0fe',
  '62c50a6d-ffd8-4739-bb19-4fa0cbf64a78',
  'e990f42b-5940-4a03-b4cf-62d3fd150d03',
  '3a49230d-dc32-46d3-b338-716e6c6db335',
  'd9602c78-8891-4e39-855a-d58387ec76d1',
  'f4e78961-0e2b-4ce0-b3f5-af86e89356cb',
  '2c716ea2-06eb-4853-b2f4-b4874312797b',
  '7f6edbcf-0d1c-44e7-a05b-915665d5b625',
  '9eef342d-5cfa-49bc-97cb-c1dd20bb8b6a',
  '3582ef82-3a12-468a-80ef-bad693199446',
  '116c25ed-46ba-4222-9346-753ed8fa474a',
  '40a1d190-1e56-4550-9423-697bff569bad',
  'be01d72f-6fca-466c-ba2c-42502ca91b8d',
  '03e03d7b-08bc-4374-8a07-f48c8b8d2fdb',
  'fae4a6e7-bbdd-4578-8a7d-ab23fda4913d',
  'd443e6bf-1df5-4da8-b718-55eec81c96e0',
  'cae33bf3-e226-4078-acea-2c46caac0fd5',
  'da59f9e8-9963-4c14-af46-86fd17b1661d',
  '99df66bb-4335-4dae-aa12-5b65a4e9f759',
  '012f80fc-5a94-479a-be72-a09b6c8d84d6',
  'fed23193-a701-4877-9757-2ace86b0b425',
  '7bc31171-7da0-49ad-b471-aaf0e2eb8add',
  'd150f645-208b-44db-bfd6-d76580079145',
  '4a67181c-396b-4548-8144-a8ae7b425ae2',
  'a819abc5-0e22-459e-83bd-4af7aa54b0a6',
  '8440bc1d-6d88-4cf7-83f4-d8de9a22f1ff',
  'de700764-a4c7-4a55-88cc-07dfa9390207',
  '857a6a38-1288-457f-849d-ed28a65d7724',
  'a9fc0531-f488-4940-981b-e6d3eea825e1',
  'e03005f8-d4e5-4d00-bac4-fa6adaf000c9',
  '1c9a6b84-c03f-41ac-91f1-cc1d469e10d9',
  '34e75bf4-6078-4a91-8433-eb99ee91fdd1',
  '9056b978-c7d1-4787-b49c-a543724e40fc',
  '7c72a4a4-01ee-435e-99c5-88da1ab985c1',
  '73d4f656-2948-4ec0-8e7d-e34a043b0eec',
  '106dd991-36e5-4ac9-a1f4-a04bf58a191c',
  'b0d43316-c92c-425f-a2bc-192ffd6bdb6b',
  '0e3792a4-28d5-4421-b3b2-c06e56d198d8',
  '16c3a984-a106-435c-beaa-469e3843df76',
  '8cc32c9e-9646-4ee8-ba4e-3c4d1afe93f9',
  'e621d2d2-5337-4fd0-b3fa-e1913e673d06',
  '76baaffa-e4eb-4c6f-bfbd-078a6dbf7d04',
  '2df3fc20-8ed5-4726-8676-da2f52136ac4',
  '5e148cab-f8f6-4ec6-948c-405cccf262cb',
  'd9332db3-5086-4155-b478-4b15e4ef7df3',
  'e02f0b4d-bf14-41fb-9984-bd3a2cb74e98',
  'e0d07078-420b-4b31-9134-8ccc579173da',
  '0e510c4e-321b-484f-99ca-06bca7010d07',
  '6ecaa704-3369-4888-b9f2-fe0dab702040',
  'b275e88c-6544-4110-a82f-1c3104819f49',
  'cffc09e3-25a5-4c42-93b8-082157af98b0',
  'fe010206-a425-47bc-b8fc-6f00768cbfdd',
  '1c93bb58-aab2-457c-88cf-2c0788b003a9',
  '2ca37594-b20c-451a-901a-db6825791a80',
  '6e5f94eb-f1ea-4e2f-9596-c97d5e8d65ea',
  '3b55f009-7c5e-4289-97b7-bda65190eab0',
  'c38fdcc1-789b-474c-85a2-8e856952b07c',
  'f5782e2d-2c1f-499e-ba29-cbfafcf03af2',
  '74d6a89a-9a0d-4952-a1e9-24aa5ad3b4ea',
  '1d69ad04-b5e7-43f8-93a4-a9f73355d596',
  'fd895a11-b1f2-4c7b-8885-02425af98fea',
  '3816758d-e790-4e81-90f9-987af80379f4',
  '60660377-01f6-44b3-992b-f5f9c0237d8c',
  '27c4b5f0-d5a2-4c02-a1a9-9cf2261c5127',
  'b691e967-f215-43a8-9a95-8a35374dc1be',
  '54a20f8e-5e35-415e-8836-73fbf1e0b25a',
  '201f8d93-29ad-46ed-9c32-14cfeb4616ca',
  'cea6ccd0-32f1-4ba2-b775-b064a895c3f8',
  '16141e23-ace6-40f7-a4a1-dcc6a7e644a1',
  'd818f9ce-39bf-4de0-a952-b71c857867de',
  '45300e4d-9fd6-4437-a1be-32a32f08e7ea',
  'd2780387-eb32-4113-8611-d6480c38e871',
  '50aad85c-ce16-4ca7-8617-e3b217be06a7',
  '55455623-10a5-4574-9ee0-ae50fad67ea9',
  '6545c325-87da-4995-a8af-5af9b537b04f',
  'f3ce177c-e733-4c08-88e8-7a3c2fc934e0',
  '3ef8b1eb-78de-4879-8bd5-2c2c4e75ecbb',
  '485d15ac-a39d-4319-9e43-0bdf65560664',
  'f5630f78-0e3d-4134-9844-3dfe0f80d7a6',
  'a2207f02-6aad-41f8-b657-1df3a5bd19ec',
  '4db14c5e-1add-4e1b-8c2b-201d4015c470',
  'a95e9890-f100-4baf-a3c5-5cc9f2fdec7e',
  '91d1a1f7-377b-4bfd-8772-fc69f3db4444',
  '2bd5ec1b-9563-40fa-888a-5278ea683ee2',
  '0ee17101-ae29-45f6-999f-f0b8fdd33da2',
  '93e2d8dd-5767-4f11-90b6-30a9c676871c',
  '99a5dddb-d93f-4468-949e-4dec796a8061',
  '87fd856e-3ae9-478a-8a9e-9fe1d16aaecd',
  'c843624f-9745-49ea-a644-db7291956392',
  '9fd389f1-f92a-4227-9eae-33b626eea279',
  'ffa80112-0e61-4b51-a429-ae88a400f832',
  '2ffb8b07-d9e5-4142-a8a1-ace2e0c3ba97',
  '7e61727c-5b71-46ce-a06a-8ce565251a37',
  '00fdaa07-f077-46de-91bb-b041cd2d10a0',
  '59bc2e01-41dd-43fa-9703-5201356602b0',
  'b1b72944-9e22-4ded-803a-1c9860f23089',
  'cdb5610e-f6ad-4221-8259-fe56b0331de4',
  '3c9b9a52-a382-4c96-86d9-82ea7a7a2ce5',
  '0469d11e-dce0-4ec7-a0cb-39245b6f1c0e',
  'ca47c7ee-39e7-4ed8-9c90-00aa1e0c451f',
  'aca70000-30c0-4791-8d0a-945ada4f11d3',
  '44b5168e-8f86-4a8b-90a4-c249ca396061',
  '08b6e42d-9e50-44ed-ace9-128e9e373453',
  'fc08b218-92d6-47da-bf97-05f7c302cc8f',
  'd13ee209-c241-4057-8c55-52bb29380e9c',
  '8afb6c2e-877e-4684-8381-040712031fd2',
  '80b20ad1-b2ce-4b96-9d2d-86b997b00888',
  '48f7c02f-83db-44c9-818f-de64ec252a4e',
  '37a06532-8087-45c4-ac89-706466732f4b',
  '0f2f7c65-e925-477d-90ba-45eba63ee4e9',
  '76297588-1572-43be-a3df-7d6a4b1b80af',
  'b5703519-6ebd-4955-8348-8c35abd5093b',
  '9d1a3eb1-e577-4630-8e9e-c23356216f53',
  '460c8837-f7c3-428d-a3ea-34f1d89e5543',
  '522cee7c-01ad-4e90-bb2a-0759118dd7ec',
  '9ab1b1ce-aa15-4e4a-b420-e0fea07d1aa9',
  '93f657b4-1522-4df2-b729-ce61a189882c',
  '4494555f-2db5-40e6-8156-0c31854920fb',
  'c07e0cdc-8336-4344-aa2c-0cf4a835fa59',
  '9c3992f2-832e-4570-8632-a649dcbdaa94',
  'cea36b51-7af7-4003-a663-f1d89d81a29f',
  '9ce8e01d-cf7c-4ebb-ac84-bfb31346ce4e',
  '2c151a39-4586-4cda-87c5-b282d34801dc',
  '04a1eeda-2187-48df-a32a-ee2ef3830d68',
  'c3337c92-14f2-4404-a252-dc0850e6aab8',
  '45a88479-a81d-4f07-8c83-4264b50c55d6',
  '2fed1362-4a0d-4680-a382-c2454c8bd95b',
  'b956e5c9-ba23-42e6-93c9-f6e3e0c299fd',
  'c7942207-26a4-4506-bd08-c0a0911bcbf8',
  '6a178143-db0d-4eef-b1e6-07ee195ed564',
  '16f6d47a-f2fa-4dcf-9e72-3737f4c4fd6d',
  '9cebd6ae-d51d-4ed0-8695-9430cec30164',
  'abe47581-4a5b-4826-b780-5deea523a05e',
  '2320f3eb-7193-4b2b-8e32-a0dbb824d326',
  '621d7634-b951-4d96-8d69-1969e53d67c7',
  'cc4c80b2-112d-4bd7-91f8-35cd717e2458',
  'b403ecf0-f6a0-4990-9ab5-c636b96fac2a'
);

-- 2) Correcciones de cantidad --------------------------------------------------
with nuevas(id, antes, nueva) as (
  values
    ('36feccb9-09b4-4133-9122-101dcd4cfc55'::uuid, 271.0::numeric, 0.271::numeric),  -- HWM0010 T2 NOTEX BLANCO DE 1.50M DE ANCHO
    ('12074b53-b06a-4be7-a746-4a27e10ff0f6'::uuid, 39.0::numeric, 0.39::numeric),  -- DTXM0010 T14 BAYETILLA AZULINO DE 1.40M DE ANCHO
    ('adc7faa4-0e38-4776-a777-e105d5b281bf'::uuid, 39.0::numeric, 0.39::numeric),  -- DTXM0016 T14 BAYETILLA AZULINO DE 1.40M DE ANCHO
    ('a51ceaf3-9e72-4970-bef2-2d9e8bec7121'::uuid, 47.0::numeric, 0.47::numeric),  -- PRM0037 T12 ELASTICO POLIESTER DE 2CM BLANCO
    ('9e6802b3-3756-49de-9c90-14aa89937194'::uuid, 35.0::numeric, 0.35::numeric),  -- PVM0016 T2 ELASTICO POLIESTER DE 2CM BLANCO
    ('831c5ad6-6ec8-4183-86b1-20578c10159e'::uuid, 0.45::numeric, 0.045::numeric),  -- DTXM0006 T16 SERMAT VERDE LORO DE 1.50M DE ANCHO
    ('4a010ff3-dc0f-46b2-ae4f-acdacf89ac55'::uuid, 0.47::numeric, 0.047::numeric),  -- PRM0139 T16 POLINAM BRILLOSO NEGRO DE 1.60M DE ANCHO
    ('13991215-c4bf-436b-a480-5e9794a8b790'::uuid, 0.9::numeric, 0.09::numeric),  -- PRM0150 T14 LENTEJUELA COSIDA LILA DE 1.35 DE ANCHO
    ('641c2cb8-f547-4f92-9dc9-66aae3de5a5b'::uuid, 0.5::numeric, 0.05::numeric),  -- PRM0201 T8 PLUSH BLANCO DE 1.60 DE ANCHO
    ('33e58114-0839-4613-9cb8-c73d4b88d6e8'::uuid, 0.5::numeric, 0.05::numeric),  -- PVXM0011 T8 PLUSH BLANCO DE 1.60 DE ANCHO
    ('202f536c-66d9-4077-8c25-c5addb62163d'::uuid, 0.8::numeric, 0.08::numeric),  -- PFXM0006 T14 GASA DE 3MM BLANCO
    ('032883da-c358-478c-b89d-6031d1282298'::uuid, 0.81::numeric, 0.081::numeric),  -- PVM0043 T14 PANA VERDE LORO DE 1.50 DE ANCHO
    ('b315b2a3-26f0-43d1-b42f-1528b6a10834'::uuid, 0.18::numeric, 0.018::numeric),  -- SSM0002 T14 CHAROLIN AMARILLO DE 1.40 DE ANCHO
    ('dcb53810-66c9-4d65-8598-eea44cf12c50'::uuid, 2.04::numeric, 0.204::numeric),  -- DTXM0027 T12 LENTEJUELA PEGADA DORADO DE 1.40 DE ANCHO
    ('80789a08-def7-41c7-a483-c0425f020f17'::uuid, 2.22::numeric, 0.216::numeric),  -- DTXM0027 T14 LENTEJUELA PEGADA DORADO DE 1.40 DE ANCHO
    ('05bc4332-c91f-49b2-aadf-5cfbe612c6d0'::uuid, 2.36::numeric, 0.236::numeric),  -- DTXM0027 T16 LENTEJUELA PEGADA DORADO DE 1.40 DE ANCHO
    ('c972a4f0-961a-44a8-916a-a78df23ec0fe'::uuid, 2.04::numeric, 0.204::numeric),  -- DTM0015 T12 LENTEJUELA PEGADA PLATEADO DE 1.40 DE ANCHO
    ('62c50a6d-ffd8-4739-bb19-4fa0cbf64a78'::uuid, 0.222::numeric, 0.216::numeric),  -- DTM0015 T14 LENTEJUELA PEGADA PLATEADO DE 1.40 DE ANCHO
    ('e990f42b-5940-4a03-b4cf-62d3fd150d03'::uuid, 2.36::numeric, 0.236::numeric),  -- DTM0015 T16 LENTEJUELA PEGADA PLATEADO DE 1.40 DE ANCHO
    ('3a49230d-dc32-46d3-b338-716e6c6db335'::uuid, 0.0::numeric, 0.524::numeric),  -- HWM0014 T4 POLINAM BRILLOSO NARANJA DE 1.60M DE ANCHO
    ('d9602c78-8891-4e39-855a-d58387ec76d1'::uuid, 0.0::numeric, 0.414::numeric),  -- HWM0014 T4 POLINAM BRILLOSO NEGRO DE 1.60M DE ANCHO
    ('f4e78961-0e2b-4ce0-b3f5-af86e89356cb'::uuid, 0.0::numeric, 0.251::numeric),  -- HWXM0001 T2 TAFETA DE FORRO CHICLE DE 1.50M DE ANCHO
    ('2c716ea2-06eb-4853-b2f4-b4874312797b'::uuid, 0.0::numeric, 0.02::numeric),  -- HWXM0001 T2 TERCIOPELO CHICLE DE 1.60M DE ANCHO
    ('7f6edbcf-0d1c-44e7-a05b-915665d5b625'::uuid, 0.0::numeric, 0.16::numeric),  -- HWXM0001 T2 TERCIOPELO NEGRO DE 1.60M DE ANCHO
    ('9eef342d-5cfa-49bc-97cb-c1dd20bb8b6a'::uuid, 0.0::numeric, 0.14::numeric),  -- HWXM0001 T2 TUL EMELY NEGRO DE 1.50M DE ANCHO
    ('3582ef82-3a12-468a-80ef-bad693199446'::uuid, 0.0::numeric, 0.251::numeric),  -- HWXM0001 T2 TUL LLANO NEGRO DE 1.60M DE ANCHO
    ('116c25ed-46ba-4222-9346-753ed8fa474a'::uuid, 0.0::numeric, 1.38::numeric),  -- PFM0015 T14 SERMAT GUINDA DE 1.50M DE ANCHO
    ('40a1d190-1e56-4550-9423-697bff569bad'::uuid, 0.0::numeric, 1.52::numeric),  -- PFM0015 T16 SERMAT GUINDA DE 1.50M DE ANCHO
    ('be01d72f-6fca-466c-ba2c-42502ca91b8d'::uuid, 0.0::numeric, 1.38::numeric),  -- PFM0017 T14 SERMAT VERDE CLINICO DE 1.50M DE ANCHO
    ('03e03d7b-08bc-4374-8a07-f48c8b8d2fdb'::uuid, 0.0::numeric, 1.52::numeric),  -- PFM0017 T16 SERMAT VERDE CLINICO DE 1.50M DE ANCHO
    ('fae4a6e7-bbdd-4578-8a7d-ab23fda4913d'::uuid, 0.0::numeric, 1.35::numeric),  -- PFM0018 T16 SERMAT BLANCO DE 1.50M DE ANCHO
    ('d443e6bf-1df5-4da8-b718-55eec81c96e0'::uuid, 0.0::numeric, 8.0::numeric),  -- PFXM0005 T16 BOTON LENTEJA #28 FUXIA
    ('cae33bf3-e226-4078-acea-2c46caac0fd5'::uuid, 0.0::numeric, 0.05::numeric),  -- PFXM0005 T16 ELASTICO POLIESTER 4 LIGAS BLANCO
    ('da59f9e8-9963-4c14-af46-86fd17b1661d'::uuid, 0.0::numeric, 0.54::numeric),  -- PFXM0005 T16 ELASTICO POLIESTER DE 2CM BLANCO
    ('99df66bb-4335-4dae-aa12-5b65a4e9f759'::uuid, 0.0::numeric, 1.78::numeric),  -- PFXM0005 T16 SERMAT BLANCO DE 1.50M DE ANCHO
    ('012f80fc-5a94-479a-be72-a09b6c8d84d6'::uuid, 0.0::numeric, 0.179::numeric),  -- PFXM0005 T16 SERMAT FUXIA DE 1.50M DE ANCHO
    ('fed23193-a701-4877-9757-2ace86b0b425'::uuid, 0.0::numeric, 0.095::numeric),  -- PRM0015 T16 LENTEJUELA COSIDA AZULINO DE 1.35 DE ANCHO
    ('7bc31171-7da0-49ad-b471-aaf0e2eb8add'::uuid, 0.0::numeric, 0.068::numeric),  -- PRM0015 T16 MITEX NARANJA DE 1.5M DE ANCHO
    ('d150f645-208b-44db-bfd6-d76580079145'::uuid, 0.0::numeric, 0.199::numeric),  -- PRM0015 T16 NOVA DE 3MM AMARILLO BRASIL
    ('4a67181c-396b-4548-8144-a8ae7b425ae2'::uuid, 0.0::numeric, 0.183::numeric),  -- PRM0015 T16 POLIESTRECH AZULINO DE 1.80 DE ANCHO
    ('a819abc5-0e22-459e-83bd-4af7aa54b0a6'::uuid, 0.0::numeric, 0.178::numeric),  -- PRM0015 T16 POLINAM BRILLOSO AMARILLO BRASIL DE 1.80 DE ANCHO
    ('8440bc1d-6d88-4cf7-83f4-d8de9a22f1ff'::uuid, 0.0::numeric, 0.251::numeric),  -- PRM0020 T2 TAFETA DE FORRO MORADO DE 1.50M DE ANCHO
    ('de700764-a4c7-4a55-88cc-07dfa9390207'::uuid, 0.0::numeric, 0.02::numeric),  -- PRM0020 T2 TERCIOPELO MORADO DE 1.60M DE ANCHO
    ('857a6a38-1288-457f-849d-ed28a65d7724'::uuid, 0.0::numeric, 0.16::numeric),  -- PRM0020 T2 TERCIOPELO NEGRO DE 1.60M DE ANCHO
    ('a9fc0531-f488-4940-981b-e6d3eea825e1'::uuid, 0.0::numeric, 0.14::numeric),  -- PRM0020 T2 TUL EMELY NEGRO DE 1.50M DE ANCHO
    ('e03005f8-d4e5-4d00-bac4-fa6adaf000c9'::uuid, 0.0::numeric, 0.47::numeric),  -- PRM0075 T16 CEZGO ACORDONADO ROJO
    ('1c9a6b84-c03f-41ac-91f1-cc1d469e10d9'::uuid, 0.0::numeric, 1.45::numeric),  -- PRM0075 T16 COLA DE RATA EN MADEJA ROJO
    ('34e75bf4-6078-4a91-8433-eb99ee91fdd1'::uuid, 0.0::numeric, 0.391::numeric),  -- PRM0075 T16 JEANS PROCESADO AZUL DE 1.70 DE ANCHO
    ('9056b978-c7d1-4787-b49c-a543724e40fc'::uuid, 0.0::numeric, 0.025::numeric),  -- PRM0075 T16 POLINAM BRILLOSO MARRON DE 1.60M DE ANCHO
    ('7c72a4a4-01ee-435e-99c5-88da1ab985c1'::uuid, 0.0::numeric, 0.145::numeric),  -- PRM0075 T16 SERMAT AMARILLO ORO DE 1.50M DE ANCHO
    ('73d4f656-2948-4ec0-8e7d-e34a043b0eec'::uuid, 0.0::numeric, 0.538::numeric),  -- PRM0075 T16 SERMAT BLANCO DE 1.50M DE ANCHO
    ('106dd991-36e5-4ac9-a1f4-a04bf58a191c'::uuid, 0.0::numeric, 0.778::numeric),  -- PRM0075 T16 TUL LLANO AZULINO DE 1.60M DE ANCHO
    ('b0d43316-c92c-425f-a2bc-192ffd6bdb6b'::uuid, 0.0::numeric, 0.98::numeric),  -- PRM0157 T16 POLINAM BRILLOSO AZULINO DE 1.60 DE ANCHO
    ('0e3792a4-28d5-4421-b3b2-c06e56d198d8'::uuid, 0.0::numeric, 0.086::numeric),  -- PRM0157 T16 POLINAM BRILLOSO LAMINADO -BLANCO DE 1.50M
    ('16c3a984-a106-435c-beaa-469e3843df76'::uuid, 0.0::numeric, 0.129::numeric),  -- PRM0157 T16 POLINAM BRILLOSO LAMINADO -ROJO DE 1.50M
    ('8cc32c9e-9646-4ee8-ba4e-3c4d1afe93f9'::uuid, 0.0::numeric, 0.25::numeric),  -- PRM0201 T10 NOTEX BLANCO DE 1.50M DE ANCHO
    ('e621d2d2-5337-4fd0-b3fa-e1913e673d06'::uuid, 0.0::numeric, 0.27::numeric),  -- PRM0201 T12 NOTEX BLANCO DE 1.50M DE ANCHO
    ('76baaffa-e4eb-4c6f-bfbd-078a6dbf7d04'::uuid, 0.0::numeric, 0.052::numeric),  -- PRM0201 T10 PLUSH BLANCO DE 1.60 DE ANCHO
    ('2df3fc20-8ed5-4726-8676-da2f52136ac4'::uuid, 0.0::numeric, 0.054::numeric),  -- PRM0201 T12 PLUSH BLANCO DE 1.60 DE ANCHO
    ('5e148cab-f8f6-4ec6-948c-405cccf262cb'::uuid, 0.0::numeric, 0.195::numeric),  -- PRM0201 T10 PLUSH NEGRO DE 1.60 DE ANCHO
    ('d9332db3-5086-4155-b478-4b15e4ef7df3'::uuid, 0.0::numeric, 0.215::numeric),  -- PRM0201 T12 PLUSH NEGRO DE 1.60 DE ANCHO
    ('e02f0b4d-bf14-41fb-9984-bd3a2cb74e98'::uuid, 0.0::numeric, 0.231::numeric),  -- PRM0201 T10 RAZO COREANO BLANCO DE 1.50M DE ANCHO
    ('e0d07078-420b-4b31-9134-8ccc579173da'::uuid, 0.0::numeric, 0.245::numeric),  -- PRM0201 T12 RAZO COREANO BLANCO DE 1.50M DE ANCHO
    ('0e510c4e-321b-484f-99ca-06bca7010d07'::uuid, 0.0::numeric, 0.671::numeric),  -- PRM0201 T10 RAZO SUBLIMADO FUXIA BOLAS BLANCAS DE 1.50M DE ANCHO
    ('6ecaa704-3369-4888-b9f2-fe0dab702040'::uuid, 0.0::numeric, 0.731::numeric),  -- PRM0201 T12 RAZO SUBLIMADO FUXIA BOLAS BLANCAS DE 1.50M DE ANCHO
    ('b275e88c-6544-4110-a82f-1c3104819f49'::uuid, 0.0::numeric, 0.45::numeric),  -- PRM0201 T10 TUL EMELY FUXIA DE 1.50M DE ANCHO
    ('cffc09e3-25a5-4c42-93b8-082157af98b0'::uuid, 0.0::numeric, 0.48::numeric),  -- PRM0201 T12 TUL EMELY FUXIA DE 1.50M DE ANCHO
    ('fe010206-a425-47bc-b8fc-6f00768cbfdd'::uuid, 0.0::numeric, 0.45::numeric),  -- PRM0201 T10 TUL LLANO FUXIA DE 1.60M DE ANCHO
    ('1c93bb58-aab2-457c-88cf-2c0788b003a9'::uuid, 0.0::numeric, 0.48::numeric),  -- PRM0201 T12 TUL LLANO FUXIA DE 1.60M DE ANCHO
    ('2ca37594-b20c-451a-901a-db6825791a80'::uuid, 0.0::numeric, 5.2::numeric),  -- PVM0016 T2 CINTA SATINADA DE 7MM BLANCO
    ('6e5f94eb-f1ea-4e2f-9596-c97d5e8d65ea'::uuid, 0.0::numeric, 5.4::numeric),  -- PVM0016 T4 CINTA SATINADA DE 7MM BLANCO
    ('3b55f009-7c5e-4289-97b7-bda65190eab0'::uuid, 0.0::numeric, 5.65::numeric),  -- PVM0016 T6 CINTA SATINADA DE 7MM BLANCO
    ('c38fdcc1-789b-474c-85a2-8e856952b07c'::uuid, 0.0::numeric, 5.95::numeric),  -- PVM0016 T8 CINTA SATINADA DE 7MM BLANCO
    ('f5782e2d-2c1f-499e-ba29-cbfafcf03af2'::uuid, 0.0::numeric, 6.25::numeric),  -- PVM0016 T12 CINTA SATINADA DE 7MM BLANCO
    ('74d6a89a-9a0d-4952-a1e9-24aa5ad3b4ea'::uuid, 0.0::numeric, 6.4::numeric),  -- PVM0016 T14 CINTA SATINADA DE 7MM BLANCO
    ('1d69ad04-b5e7-43f8-93a4-a9f73355d596'::uuid, 0.0::numeric, 6.55::numeric),  -- PVM0016 T16 CINTA SATINADA DE 7MM BLANCO
    ('fd895a11-b1f2-4c7b-8885-02425af98fea'::uuid, 0.0::numeric, 0.112::numeric),  -- PVM0017 T16 SERMAT AMARILLO BRASIL DE 1.50M DE ANCHO
    ('3816758d-e790-4e81-90f9-987af80379f4'::uuid, 0.0::numeric, 0.465::numeric),  -- PVM0017 T16 SERMAT BLANCO DE 1.50M DE ANCHO
    ('60660377-01f6-44b3-992b-f5f9c0237d8c'::uuid, 0.0::numeric, 0.69::numeric),  -- PVM0017 T16 SERMAT ROJO DE 1.50M DE ANCHO
    ('27c4b5f0-d5a2-4c02-a1a9-9cf2261c5127'::uuid, 0.0::numeric, 0.96::numeric),  -- PVM0017 T16 SERMAT VERDE LORO DE 1.50M DE ANCHO
    ('b691e967-f215-43a8-9a95-8a35374dc1be'::uuid, 0.0::numeric, 0.63::numeric),  -- PVM0018 T16 POLIESTRECH BLANCO DE 1.80 DE ANCHO
    ('54a20f8e-5e35-415e-8836-73fbf1e0b25a'::uuid, 0.0::numeric, 0.94::numeric),  -- PVM0018 T16 POLINAM BRILLOSO AZULINO DE 1.60 DE ANCHO
    ('201f8d93-29ad-46ed-9c32-14cfeb4616ca'::uuid, 0.0::numeric, 0.2::numeric),  -- PVM0018 T16 POLINAM BRILLOSO BLANCO DE 1.60 DE ANCHO
    ('cea6ccd0-32f1-4ba2-b775-b064a895c3f8'::uuid, 0.0::numeric, 0.325::numeric),  -- PVM0018 T16 POLINAM BRILLOSO ROJO DE 1.60M DE ANCHO
    ('16141e23-ace6-40f7-a4a1-dcc6a7e644a1'::uuid, 0.0::numeric, 0.105::numeric),  -- PVM0018 T16 POLINAM SIN BRILLO TURQUEZA DE 1.60M DE ANCHO
    ('d818f9ce-39bf-4de0-a952-b71c857867de'::uuid, 0.0::numeric, 0.327::numeric),  -- PVM0025 T16 NOVA DE 3MM VERDE LORO
    ('45300e4d-9fd6-4437-a1be-32a32f08e7ea'::uuid, 0.0::numeric, 0.96::numeric),  -- PVM0025 T16 SERMAT VERDE LORO DE 1.50M DE ANCHO
    ('d2780387-eb32-4113-8611-d6480c38e871'::uuid, 0.0::numeric, 0.74::numeric),  -- PVM0025 T16 SERMAT VERDE MANZANA DE 1.50M DE ANCHO
    ('50aad85c-ce16-4ca7-8617-e3b217be06a7'::uuid, 0.0::numeric, 0.265::numeric),  -- PVM0025 T16 TAFETA DE FORRO VERDE LIMON DE 1.50M DE ANCHO
    ('55455623-10a5-4574-9ee0-ae50fad67ea9'::uuid, 0.0::numeric, 0.37::numeric),  -- PVM0040 T14 POLIESTRECH VERDE LORO DE 1.80 DE ANCHO
    ('6545c325-87da-4995-a8af-5af9b537b04f'::uuid, 0.0::numeric, 0.602::numeric),  -- PVM0040 T14 POLINAM BRILLOSO AZUL DE 1.60 DE ANCHO
    ('f3ce177c-e733-4c08-88e8-7a3c2fc934e0'::uuid, 0.0::numeric, 0.091::numeric),  -- PVM0040 T14 TAFETA DE FORRO AZUL DE 1.50M DE ANCHO
    ('3ef8b1eb-78de-4879-8bd5-2c2c4e75ecbb'::uuid, 0.0::numeric, 0.25::numeric),  -- PVXM0011 T10 NOTEX BLANCO DE 1.50M DE ANCHO
    ('485d15ac-a39d-4319-9e43-0bdf65560664'::uuid, 0.0::numeric, 0.27::numeric),  -- PVXM0011 T12 NOTEX BLANCO DE 1.50M DE ANCHO
    ('f5630f78-0e3d-4134-9844-3dfe0f80d7a6'::uuid, 0.0::numeric, 0.052::numeric),  -- PVXM0011 T10 PLUSH BLANCO DE 1.60 DE ANCHO
    ('a2207f02-6aad-41f8-b657-1df3a5bd19ec'::uuid, 0.0::numeric, 0.054::numeric),  -- PVXM0011 T12 PLUSH BLANCO DE 1.60 DE ANCHO
    ('4db14c5e-1add-4e1b-8c2b-201d4015c470'::uuid, 0.0::numeric, 0.195::numeric),  -- PVXM0011 T10 PLUSH NEGRO DE 1.60 DE ANCHO
    ('a95e9890-f100-4baf-a3c5-5cc9f2fdec7e'::uuid, 0.0::numeric, 0.215::numeric),  -- PVXM0011 T12 PLUSH NEGRO DE 1.60 DE ANCHO
    ('91d1a1f7-377b-4bfd-8772-fc69f3db4444'::uuid, 0.0::numeric, 0.231::numeric),  -- PVXM0011 T10 RAZO COREANO BLANCO DE 1.50M DE ANCHO
    ('2bd5ec1b-9563-40fa-888a-5278ea683ee2'::uuid, 0.0::numeric, 0.245::numeric),  -- PVXM0011 T12 RAZO COREANO BLANCO DE 1.50M DE ANCHO
    ('0ee17101-ae29-45f6-999f-f0b8fdd33da2'::uuid, 0.0::numeric, 0.671::numeric),  -- PVXM0011 T10 RAZO SUBLIMADO ROJO BOLAS BLANCAS DE 1.50M DE ANCHO
    ('93e2d8dd-5767-4f11-90b6-30a9c676871c'::uuid, 0.0::numeric, 0.731::numeric),  -- PVXM0011 T12 RAZO SUBLIMADO ROJO BOLAS BLANCAS DE 1.50M DE ANCHO
    ('99a5dddb-d93f-4468-949e-4dec796a8061'::uuid, 0.0::numeric, 0.45::numeric),  -- PVXM0011 T10 TUL EMELY ROJO DE 1.50M DE ANCHO
    ('87fd856e-3ae9-478a-8a9e-9fe1d16aaecd'::uuid, 0.0::numeric, 0.48::numeric),  -- PVXM0011 T12 TUL EMELY ROJO DE 1.50M DE ANCHO
    ('c843624f-9745-49ea-a644-db7291956392'::uuid, 0.0::numeric, 0.45::numeric),  -- PVXM0011 T10 TUL LLANO ROJO DE 1.60M DE ANCHO
    ('9fd389f1-f92a-4227-9eae-33b626eea279'::uuid, 0.0::numeric, 0.48::numeric)   -- PVXM0011 T12 TUL LLANO ROJO DE 1.60M DE ANCHO
)
update recetas_lineas rl
   set cantidad = n.nueva
  from nuevas n
 where rl.id = n.id
   and rl.cantidad = n.antes;   -- candado: solo si sigue como estaba

-- 3) Tallas de adulto en prendas de nino ---------------------------------------
delete from recetas_lineas
 where cantidad = 0              -- candado: solo si sigue en cero
   and id in (
  'ffa80112-0e61-4b51-a429-ae88a400f832',
  '2ffb8b07-d9e5-4142-a8a1-ace2e0c3ba97',
  '7e61727c-5b71-46ce-a06a-8ce565251a37',
  '00fdaa07-f077-46de-91bb-b041cd2d10a0',
  '59bc2e01-41dd-43fa-9703-5201356602b0',
  'b1b72944-9e22-4ded-803a-1c9860f23089',
  'cdb5610e-f6ad-4221-8259-fe56b0331de4',
  '3c9b9a52-a382-4c96-86d9-82ea7a7a2ce5',
  '0469d11e-dce0-4ec7-a0cb-39245b6f1c0e',
  'ca47c7ee-39e7-4ed8-9c90-00aa1e0c451f',
  'aca70000-30c0-4791-8d0a-945ada4f11d3',
  '44b5168e-8f86-4a8b-90a4-c249ca396061',
  '08b6e42d-9e50-44ed-ace9-128e9e373453',
  'fc08b218-92d6-47da-bf97-05f7c302cc8f',
  'd13ee209-c241-4057-8c55-52bb29380e9c',
  '8afb6c2e-877e-4684-8381-040712031fd2',
  '80b20ad1-b2ce-4b96-9d2d-86b997b00888',
  '48f7c02f-83db-44c9-818f-de64ec252a4e',
  '37a06532-8087-45c4-ac89-706466732f4b',
  '0f2f7c65-e925-477d-90ba-45eba63ee4e9',
  '76297588-1572-43be-a3df-7d6a4b1b80af',
  'b5703519-6ebd-4955-8348-8c35abd5093b',
  '9d1a3eb1-e577-4630-8e9e-c23356216f53',
  '460c8837-f7c3-428d-a3ea-34f1d89e5543',
  '522cee7c-01ad-4e90-bb2a-0759118dd7ec',
  '9ab1b1ce-aa15-4e4a-b420-e0fea07d1aa9',
  '93f657b4-1522-4df2-b729-ce61a189882c',
  '4494555f-2db5-40e6-8156-0c31854920fb',
  'c07e0cdc-8336-4344-aa2c-0cf4a835fa59',
  '9c3992f2-832e-4570-8632-a649dcbdaa94',
  'cea36b51-7af7-4003-a663-f1d89d81a29f',
  '9ce8e01d-cf7c-4ebb-ac84-bfb31346ce4e',
  '2c151a39-4586-4cda-87c5-b282d34801dc',
  '04a1eeda-2187-48df-a32a-ee2ef3830d68',
  'c3337c92-14f2-4404-a252-dc0850e6aab8',
  '45a88479-a81d-4f07-8c83-4264b50c55d6',
  '2fed1362-4a0d-4680-a382-c2454c8bd95b',
  'b956e5c9-ba23-42e6-93c9-f6e3e0c299fd',
  'c7942207-26a4-4506-bd08-c0a0911bcbf8',
  '6a178143-db0d-4eef-b1e6-07ee195ed564',
  '16f6d47a-f2fa-4dcf-9e72-3737f4c4fd6d',
  '9cebd6ae-d51d-4ed0-8695-9430cec30164',
  'abe47581-4a5b-4826-b780-5deea523a05e',
  '2320f3eb-7193-4b2b-8e32-a0dbb824d326',
  '621d7634-b951-4d96-8d69-1969e53d67c7',
  'cc4c80b2-112d-4bd7-91f8-35cd717e2458',
  'b403ecf0-f6a0-4990-9ab5-c636b96fac2a'
);

-- 4) Verificacion: tiene que dar 106 / 0 / 47 / 0 ---------------------------
select
  (select count(*) from respaldo_recetas_20260923
     where respaldado_en > now() - interval '1 minute')           as respaldadas,
  (select count(*) from recetas_lineas rl
     join (values ('36feccb9-09b4-4133-9122-101dcd4cfc55', 0.271::numeric), ('12074b53-b06a-4be7-a746-4a27e10ff0f6', 0.39::numeric), ('adc7faa4-0e38-4776-a777-e105d5b281bf', 0.39::numeric), ('a51ceaf3-9e72-4970-bef2-2d9e8bec7121', 0.47::numeric), ('9e6802b3-3756-49de-9c90-14aa89937194', 0.35::numeric), ('831c5ad6-6ec8-4183-86b1-20578c10159e', 0.045::numeric), ('4a010ff3-dc0f-46b2-ae4f-acdacf89ac55', 0.047::numeric), ('13991215-c4bf-436b-a480-5e9794a8b790', 0.09::numeric), ('641c2cb8-f547-4f92-9dc9-66aae3de5a5b', 0.05::numeric), ('33e58114-0839-4613-9cb8-c73d4b88d6e8', 0.05::numeric), ('202f536c-66d9-4077-8c25-c5addb62163d', 0.08::numeric), ('032883da-c358-478c-b89d-6031d1282298', 0.081::numeric), ('b315b2a3-26f0-43d1-b42f-1528b6a10834', 0.018::numeric), ('dcb53810-66c9-4d65-8598-eea44cf12c50', 0.204::numeric), ('80789a08-def7-41c7-a483-c0425f020f17', 0.216::numeric), ('05bc4332-c91f-49b2-aadf-5cfbe612c6d0', 0.236::numeric), ('c972a4f0-961a-44a8-916a-a78df23ec0fe', 0.204::numeric), ('62c50a6d-ffd8-4739-bb19-4fa0cbf64a78', 0.216::numeric), ('e990f42b-5940-4a03-b4cf-62d3fd150d03', 0.236::numeric), ('3a49230d-dc32-46d3-b338-716e6c6db335', 0.524::numeric), ('d9602c78-8891-4e39-855a-d58387ec76d1', 0.414::numeric), ('f4e78961-0e2b-4ce0-b3f5-af86e89356cb', 0.251::numeric), ('2c716ea2-06eb-4853-b2f4-b4874312797b', 0.02::numeric), ('7f6edbcf-0d1c-44e7-a05b-915665d5b625', 0.16::numeric), ('9eef342d-5cfa-49bc-97cb-c1dd20bb8b6a', 0.14::numeric), ('3582ef82-3a12-468a-80ef-bad693199446', 0.251::numeric), ('116c25ed-46ba-4222-9346-753ed8fa474a', 1.38::numeric), ('40a1d190-1e56-4550-9423-697bff569bad', 1.52::numeric), ('be01d72f-6fca-466c-ba2c-42502ca91b8d', 1.38::numeric), ('03e03d7b-08bc-4374-8a07-f48c8b8d2fdb', 1.52::numeric), ('fae4a6e7-bbdd-4578-8a7d-ab23fda4913d', 1.35::numeric), ('d443e6bf-1df5-4da8-b718-55eec81c96e0', 8.0::numeric), ('cae33bf3-e226-4078-acea-2c46caac0fd5', 0.05::numeric), ('da59f9e8-9963-4c14-af46-86fd17b1661d', 0.54::numeric), ('99df66bb-4335-4dae-aa12-5b65a4e9f759', 1.78::numeric), ('012f80fc-5a94-479a-be72-a09b6c8d84d6', 0.179::numeric), ('fed23193-a701-4877-9757-2ace86b0b425', 0.095::numeric), ('7bc31171-7da0-49ad-b471-aaf0e2eb8add', 0.068::numeric), ('d150f645-208b-44db-bfd6-d76580079145', 0.199::numeric), ('4a67181c-396b-4548-8144-a8ae7b425ae2', 0.183::numeric), ('a819abc5-0e22-459e-83bd-4af7aa54b0a6', 0.178::numeric), ('8440bc1d-6d88-4cf7-83f4-d8de9a22f1ff', 0.251::numeric), ('de700764-a4c7-4a55-88cc-07dfa9390207', 0.02::numeric), ('857a6a38-1288-457f-849d-ed28a65d7724', 0.16::numeric), ('a9fc0531-f488-4940-981b-e6d3eea825e1', 0.14::numeric), ('e03005f8-d4e5-4d00-bac4-fa6adaf000c9', 0.47::numeric), ('1c9a6b84-c03f-41ac-91f1-cc1d469e10d9', 1.45::numeric), ('34e75bf4-6078-4a91-8433-eb99ee91fdd1', 0.391::numeric), ('9056b978-c7d1-4787-b49c-a543724e40fc', 0.025::numeric), ('7c72a4a4-01ee-435e-99c5-88da1ab985c1', 0.145::numeric), ('73d4f656-2948-4ec0-8e7d-e34a043b0eec', 0.538::numeric), ('106dd991-36e5-4ac9-a1f4-a04bf58a191c', 0.778::numeric), ('b0d43316-c92c-425f-a2bc-192ffd6bdb6b', 0.98::numeric), ('0e3792a4-28d5-4421-b3b2-c06e56d198d8', 0.086::numeric), ('16c3a984-a106-435c-beaa-469e3843df76', 0.129::numeric), ('8cc32c9e-9646-4ee8-ba4e-3c4d1afe93f9', 0.25::numeric), ('e621d2d2-5337-4fd0-b3fa-e1913e673d06', 0.27::numeric), ('76baaffa-e4eb-4c6f-bfbd-078a6dbf7d04', 0.052::numeric), ('2df3fc20-8ed5-4726-8676-da2f52136ac4', 0.054::numeric), ('5e148cab-f8f6-4ec6-948c-405cccf262cb', 0.195::numeric), ('d9332db3-5086-4155-b478-4b15e4ef7df3', 0.215::numeric), ('e02f0b4d-bf14-41fb-9984-bd3a2cb74e98', 0.231::numeric), ('e0d07078-420b-4b31-9134-8ccc579173da', 0.245::numeric), ('0e510c4e-321b-484f-99ca-06bca7010d07', 0.671::numeric), ('6ecaa704-3369-4888-b9f2-fe0dab702040', 0.731::numeric), ('b275e88c-6544-4110-a82f-1c3104819f49', 0.45::numeric), ('cffc09e3-25a5-4c42-93b8-082157af98b0', 0.48::numeric), ('fe010206-a425-47bc-b8fc-6f00768cbfdd', 0.45::numeric), ('1c93bb58-aab2-457c-88cf-2c0788b003a9', 0.48::numeric), ('2ca37594-b20c-451a-901a-db6825791a80', 5.2::numeric), ('6e5f94eb-f1ea-4e2f-9596-c97d5e8d65ea', 5.4::numeric), ('3b55f009-7c5e-4289-97b7-bda65190eab0', 5.65::numeric), ('c38fdcc1-789b-474c-85a2-8e856952b07c', 5.95::numeric), ('f5782e2d-2c1f-499e-ba29-cbfafcf03af2', 6.25::numeric), ('74d6a89a-9a0d-4952-a1e9-24aa5ad3b4ea', 6.4::numeric), ('1d69ad04-b5e7-43f8-93a4-a9f73355d596', 6.55::numeric), ('fd895a11-b1f2-4c7b-8885-02425af98fea', 0.112::numeric), ('3816758d-e790-4e81-90f9-987af80379f4', 0.465::numeric), ('60660377-01f6-44b3-992b-f5f9c0237d8c', 0.69::numeric), ('27c4b5f0-d5a2-4c02-a1a9-9cf2261c5127', 0.96::numeric), ('b691e967-f215-43a8-9a95-8a35374dc1be', 0.63::numeric), ('54a20f8e-5e35-415e-8836-73fbf1e0b25a', 0.94::numeric), ('201f8d93-29ad-46ed-9c32-14cfeb4616ca', 0.2::numeric), ('cea6ccd0-32f1-4ba2-b775-b064a895c3f8', 0.325::numeric), ('16141e23-ace6-40f7-a4a1-dcc6a7e644a1', 0.105::numeric), ('d818f9ce-39bf-4de0-a952-b71c857867de', 0.327::numeric), ('45300e4d-9fd6-4437-a1be-32a32f08e7ea', 0.96::numeric), ('d2780387-eb32-4113-8611-d6480c38e871', 0.74::numeric), ('50aad85c-ce16-4ca7-8617-e3b217be06a7', 0.265::numeric), ('55455623-10a5-4574-9ee0-ae50fad67ea9', 0.37::numeric), ('6545c325-87da-4995-a8af-5af9b537b04f', 0.602::numeric), ('f3ce177c-e733-4c08-88e8-7a3c2fc934e0', 0.091::numeric), ('3ef8b1eb-78de-4879-8bd5-2c2c4e75ecbb', 0.25::numeric), ('485d15ac-a39d-4319-9e43-0bdf65560664', 0.27::numeric), ('f5630f78-0e3d-4134-9844-3dfe0f80d7a6', 0.052::numeric), ('a2207f02-6aad-41f8-b657-1df3a5bd19ec', 0.054::numeric), ('4db14c5e-1add-4e1b-8c2b-201d4015c470', 0.195::numeric), ('a95e9890-f100-4baf-a3c5-5cc9f2fdec7e', 0.215::numeric), ('91d1a1f7-377b-4bfd-8772-fc69f3db4444', 0.231::numeric), ('2bd5ec1b-9563-40fa-888a-5278ea683ee2', 0.245::numeric), ('0ee17101-ae29-45f6-999f-f0b8fdd33da2', 0.671::numeric), ('93e2d8dd-5767-4f11-90b6-30a9c676871c', 0.731::numeric), ('99a5dddb-d93f-4468-949e-4dec796a8061', 0.45::numeric), ('87fd856e-3ae9-478a-8a9e-9fe1d16aaecd', 0.48::numeric), ('c843624f-9745-49ea-a644-db7291956392', 0.45::numeric), ('9fd389f1-f92a-4227-9eae-33b626eea279', 0.48::numeric)) v(id, nueva) on rl.id = v.id::uuid
    where rl.cantidad <> v.nueva)                                  as cambios_que_no_entraron,
  47 - (select count(*) from recetas_lineas where id in ('ffa80112-0e61-4b51-a429-ae88a400f832', '2ffb8b07-d9e5-4142-a8a1-ace2e0c3ba97', '7e61727c-5b71-46ce-a06a-8ce565251a37', '00fdaa07-f077-46de-91bb-b041cd2d10a0', '59bc2e01-41dd-43fa-9703-5201356602b0', 'b1b72944-9e22-4ded-803a-1c9860f23089', 'cdb5610e-f6ad-4221-8259-fe56b0331de4', '3c9b9a52-a382-4c96-86d9-82ea7a7a2ce5', '0469d11e-dce0-4ec7-a0cb-39245b6f1c0e', 'ca47c7ee-39e7-4ed8-9c90-00aa1e0c451f', 'aca70000-30c0-4791-8d0a-945ada4f11d3', '44b5168e-8f86-4a8b-90a4-c249ca396061', '08b6e42d-9e50-44ed-ace9-128e9e373453', 'fc08b218-92d6-47da-bf97-05f7c302cc8f', 'd13ee209-c241-4057-8c55-52bb29380e9c', '8afb6c2e-877e-4684-8381-040712031fd2', '80b20ad1-b2ce-4b96-9d2d-86b997b00888', '48f7c02f-83db-44c9-818f-de64ec252a4e', '37a06532-8087-45c4-ac89-706466732f4b', '0f2f7c65-e925-477d-90ba-45eba63ee4e9', '76297588-1572-43be-a3df-7d6a4b1b80af', 'b5703519-6ebd-4955-8348-8c35abd5093b', '9d1a3eb1-e577-4630-8e9e-c23356216f53', '460c8837-f7c3-428d-a3ea-34f1d89e5543', '522cee7c-01ad-4e90-bb2a-0759118dd7ec', '9ab1b1ce-aa15-4e4a-b420-e0fea07d1aa9', '93f657b4-1522-4df2-b729-ce61a189882c', '4494555f-2db5-40e6-8156-0c31854920fb', 'c07e0cdc-8336-4344-aa2c-0cf4a835fa59', '9c3992f2-832e-4570-8632-a649dcbdaa94', 'cea36b51-7af7-4003-a663-f1d89d81a29f', '9ce8e01d-cf7c-4ebb-ac84-bfb31346ce4e', '2c151a39-4586-4cda-87c5-b282d34801dc', '04a1eeda-2187-48df-a32a-ee2ef3830d68', 'c3337c92-14f2-4404-a252-dc0850e6aab8', '45a88479-a81d-4f07-8c83-4264b50c55d6', '2fed1362-4a0d-4680-a382-c2454c8bd95b', 'b956e5c9-ba23-42e6-93c9-f6e3e0c299fd', 'c7942207-26a4-4506-bd08-c0a0911bcbf8', '6a178143-db0d-4eef-b1e6-07ee195ed564', '16f6d47a-f2fa-4dcf-9e72-3737f4c4fd6d', '9cebd6ae-d51d-4ed0-8695-9430cec30164', 'abe47581-4a5b-4826-b780-5deea523a05e', '2320f3eb-7193-4b2b-8e32-a0dbb824d326', '621d7634-b951-4d96-8d69-1969e53d67c7', 'cc4c80b2-112d-4bd7-91f8-35cd717e2458', 'b403ecf0-f6a0-4990-9ab5-c636b96fac2a')) as borradas,
  (select count(*) from recetas_lineas where id in ('ffa80112-0e61-4b51-a429-ae88a400f832', '2ffb8b07-d9e5-4142-a8a1-ace2e0c3ba97', '7e61727c-5b71-46ce-a06a-8ce565251a37', '00fdaa07-f077-46de-91bb-b041cd2d10a0', '59bc2e01-41dd-43fa-9703-5201356602b0', 'b1b72944-9e22-4ded-803a-1c9860f23089', 'cdb5610e-f6ad-4221-8259-fe56b0331de4', '3c9b9a52-a382-4c96-86d9-82ea7a7a2ce5', '0469d11e-dce0-4ec7-a0cb-39245b6f1c0e', 'ca47c7ee-39e7-4ed8-9c90-00aa1e0c451f', 'aca70000-30c0-4791-8d0a-945ada4f11d3', '44b5168e-8f86-4a8b-90a4-c249ca396061', '08b6e42d-9e50-44ed-ace9-128e9e373453', 'fc08b218-92d6-47da-bf97-05f7c302cc8f', 'd13ee209-c241-4057-8c55-52bb29380e9c', '8afb6c2e-877e-4684-8381-040712031fd2', '80b20ad1-b2ce-4b96-9d2d-86b997b00888', '48f7c02f-83db-44c9-818f-de64ec252a4e', '37a06532-8087-45c4-ac89-706466732f4b', '0f2f7c65-e925-477d-90ba-45eba63ee4e9', '76297588-1572-43be-a3df-7d6a4b1b80af', 'b5703519-6ebd-4955-8348-8c35abd5093b', '9d1a3eb1-e577-4630-8e9e-c23356216f53', '460c8837-f7c3-428d-a3ea-34f1d89e5543', '522cee7c-01ad-4e90-bb2a-0759118dd7ec', '9ab1b1ce-aa15-4e4a-b420-e0fea07d1aa9', '93f657b4-1522-4df2-b729-ce61a189882c', '4494555f-2db5-40e6-8156-0c31854920fb', 'c07e0cdc-8336-4344-aa2c-0cf4a835fa59', '9c3992f2-832e-4570-8632-a649dcbdaa94', 'cea36b51-7af7-4003-a663-f1d89d81a29f', '9ce8e01d-cf7c-4ebb-ac84-bfb31346ce4e', '2c151a39-4586-4cda-87c5-b282d34801dc', '04a1eeda-2187-48df-a32a-ee2ef3830d68', 'c3337c92-14f2-4404-a252-dc0850e6aab8', '45a88479-a81d-4f07-8c83-4264b50c55d6', '2fed1362-4a0d-4680-a382-c2454c8bd95b', 'b956e5c9-ba23-42e6-93c9-f6e3e0c299fd', 'c7942207-26a4-4506-bd08-c0a0911bcbf8', '6a178143-db0d-4eef-b1e6-07ee195ed564', '16f6d47a-f2fa-4dcf-9e72-3737f4c4fd6d', '9cebd6ae-d51d-4ed0-8695-9430cec30164', 'abe47581-4a5b-4826-b780-5deea523a05e', '2320f3eb-7193-4b2b-8e32-a0dbb824d326', '621d7634-b951-4d96-8d69-1969e53d67c7', 'cc4c80b2-112d-4bd7-91f8-35cd717e2458', 'b403ecf0-f6a0-4990-9ab5-c636b96fac2a')) as borrados_que_quedaron;

commit;
