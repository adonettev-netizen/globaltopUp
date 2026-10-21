/*
# Seed operators for key countries

Populates the operators table with the major mobile operators for each
supported country. These are the real DingConnect provider codes. When
UAT mode is active, the recharge webhook substitutes the recipient
number with the operator's uat_phone_number (default 910000000001).
*/

-- Dominican Republic (DO)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('DO-OR',  '815a3453-ab4e-4e30-b96b-9d126e126e48', 'Orange Dominicana',     true, '910000000001'),
  ('DO-CL',  '815a3453-ab4e-4e30-b96b-9d126e126e48', 'Claro Dominican Republic', true, '910000000001'),
  ('DO-VM',  '815a3453-ab4e-4e30-b96b-9d126e126e48', 'Viva (Altice)',         true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Haiti (HT)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('HT-DG',  '5e18adbf-9457-4148-84c0-abdf7261b051', 'Digicel Haiti',    true, '910000000001'),
  ('HT-NA',  '5e18adbf-9457-4148-84c0-abdf7261b051', 'Natcom Haiti',     true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Mexico (MX)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('MX-TM',  'af53c359-d25f-4df7-9cf1-ad34def92e15', 'Telcel',           true, '910000000001'),
  ('MX-AT',  'af53c359-d25f-4df7-9cf1-ad34def92e15', 'AT&T Mexico',      true, '910000000001'),
  ('MX-MB',  'af53c359-d25f-4df7-9cf1-ad34def92e15', 'Movistar Mexico',  true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Colombia (CO)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('CO-CL',  '5bd27b57-01c5-43af-9651-c7304c248d19', 'Claro Colombia',   true, '910000000001'),
  ('CO-TM',  '5bd27b57-01c5-43af-9651-c7304c248d19', 'Tigo Colombia',    true, '910000000001'),
  ('CO-MB',  '5bd27b57-01c5-43af-9651-c7304c248d19', 'Movistar Colombia', true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Brazil (BR)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('BR-VV',  'f5a36ff9-1f20-4276-acf8-21c793607a24', 'Vivo',             true, '910000000001'),
  ('BR-CL',  'f5a36ff9-1f20-4276-acf8-21c793607a24', 'Claro Brazil',     true, '910000000001'),
  ('BR-TM',  'f5a36ff9-1f20-4276-acf8-21c793607a24', 'TIM Brazil',       true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Ecuador (EC)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('EC-CL',  '9d1d072c-7f01-44b2-9c36-0327f648e0c6', 'Claro Ecuador',    true, '910000000001'),
  ('EC-MB',  '9d1d072c-7f01-44b2-9c36-0327f648e0c6', 'Movistar Ecuador', true, '910000000001'),
  ('EC-CN',  '9d1d072c-7f01-44b2-9c36-0327f648e0c6', 'CNT Ecuador',      true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Peru (PE)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('PE-MB',  '11c6ed2b-3d9f-431c-a534-7a085baeda6e', 'Movistar Peru',    true, '910000000001'),
  ('PE-CL',  '11c6ed2b-3d9f-431c-a534-7a085baeda6e', 'Claro Peru',       true, '910000000001'),
  ('PE-BB',  '11c6ed2b-3d9f-431c-a534-7a085baeda6e', 'Bitel Peru',       true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Guatemala (GT)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('GT-CL',  '64ccd298-a2b4-46ee-8803-7d56169702c3', 'Claro Guatemala',  true, '910000000001'),
  ('GT-TM',  '64ccd298-a2b4-46ee-8803-7d56169702c3', 'Tigo Guatemala',   true, '910000000001'),
  ('GT-MB',  '64ccd298-a2b4-46ee-8803-7d56169702c3', 'Movistar Guatemala', true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Honduras (HN)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('HN-TM',  'cacfee21-66a9-4cd0-8499-b57d7006ffdc', 'Tigo Honduras',    true, '910000000001'),
  ('HN-CL',  'cacfee21-66a9-4cd0-8499-b57d7006ffdc', 'Claro Honduras',   true, '910000000001'),
  ('HN-MB',  'cacfee21-66a9-4cd0-8499-b57d7006ffdc', 'Movistar Honduras', true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- El Salvador (SV)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('SV-TM',  'e06f366c-83c4-414b-9c38-841771677f26', 'Tigo El Salvador', true, '910000000001'),
  ('SV-CL',  'e06f366c-83c4-414b-9c38-841771677f26', 'Claro El Salvador', true, '910000000001'),
  ('SV-MB',  'e06f366c-83c4-414b-9c38-841771677f26', 'Movistar El Salvador', true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Nicaragua (NI)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('NI-TM',  '9c36c1dc-3336-4dec-b146-7a4dd495992b', 'Tigo Nicaragua',   true, '910000000001'),
  ('NI-CL',  '9c36c1dc-3336-4dec-b146-7a4dd495992b', 'Claro Nicaragua',  true, '910000000001'),
  ('NI-MB',  '9c36c1dc-3336-4dec-b146-7a4dd495992b', 'Movistar Nicaragua', true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Costa Rica (CR)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('CR-KL',  'c7a47870-0947-4c7b-87a3-b715a7514caf', 'Kolbi (ICE)',      true, '910000000001'),
  ('CR-CL',  'c7a47870-0947-4c7b-87a3-b715a7514caf', 'Claro Costa Rica', true, '910000000001'),
  ('CR-MB',  'c7a47870-0947-4c7b-87a3-b715a7514caf', 'Movistar Costa Rica', true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Panama (PA)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('PA-TM',  '3a553cae-e419-42ae-b00f-a3fab0557d6d', 'Tigo Panama',      true, '910000000001'),
  ('PA-CL',  '3a553cae-e419-42ae-b00f-a3fab0557d6d', 'Claro Panama',     true, '910000000001'),
  ('PA-MB',  '3a553cae-e419-42ae-b00f-a3fab0557d6d', 'Movistar Panama',  true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Cuba (CU)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('CU-CT',  '5bca5a1a-82ce-47ca-84e1-6a7cef8ebae5', 'Cubacel',          true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Venezuela (VE)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('VE-MB',  '74a70c5b-487d-40d0-8474-693163841ac1', 'Movilnet',         true, '910000000001'),
  ('VE-MV',  '74a70c5b-487d-40d0-8474-693163841ac1', 'Movistar Venezuela', true, '910000000001'),
  ('VE-DG',  '74a70c5b-487d-40d0-8474-693163841ac1', 'Digitel',          true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Argentina (AR)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('AR-CL',  '5c395bbe-5a81-41d5-b943-6acd31c8bb6e', 'Claro Argentina',  true, '910000000001'),
  ('AR-MB',  '5c395bbe-5a81-41d5-b943-6acd31c8bb6e', 'Movistar Argentina', true, '910000000001'),
  ('AR-PX',  '5c395bbe-5a81-41d5-b943-6acd31c8bb6e', 'Personal Argentina', true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Bolivia (BO)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('BO-TM',  '1dab995e-13fc-44d0-b7f9-0f3e91a2a77d', 'Tigo Bolivia',     true, '910000000001'),
  ('BO-CL',  '1dab995e-13fc-44d0-b7f9-0f3e91a2a77d', 'Claro Bolivia',    true, '910000000001'),
  ('BO-NB',  '1dab995e-13fc-44d0-b7f9-0f3e91a2a77d', 'Nuevatel (Viva)',  true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Paraguay (PY)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('PY-TM',  'e8433ecb-5ff6-4066-8d2e-86d075b97504', 'Tigo Paraguay',    true, '910000000001'),
  ('PY-CL',  'e8433ecb-5ff6-4066-8d2e-86d075b97504', 'Claro Paraguay',   true, '910000000001'),
  ('PY-PX',  'e8433ecb-5ff6-4066-8d2e-86d075b97504', 'Personal Paraguay', true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Uruguay (UY)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('UY-AN',  '6bf165f5-53d7-48b4-874e-c42271415a1f', 'Antel',            true, '910000000001'),
  ('UY-CL',  '6bf165f5-53d7-48b4-874e-c42271415a1f', 'Claro Uruguay',    true, '910000000001'),
  ('UY-MB',  '6bf165f5-53d7-48b4-874e-c42271415a1f', 'Movistar Uruguay', true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Chile (CL)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('CL-EN',  'e11d4877-34dc-436d-9098-633f568720ea', 'Entel',            true, '910000000001'),
  ('CL-CL',  'e11d4877-34dc-436d-9098-633f568720ea', 'Claro Chile',      true, '910000000001'),
  ('CL-MB',  'e11d4877-34dc-436d-9098-633f568720ea', 'Movistar Chile',   true, '910000000001'),
  ('CL-WM',  'e11d4877-34dc-436d-9098-633f568720ea', 'WOM Chile',        true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- United States (US)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('US-TM',  '4c4a6a74-68a1-4a4f-8dc2-9c01cc20ef69', 'T-Mobile USA',     true, '910000000001'),
  ('US-VZ',  '4c4a6a74-68a1-4a4f-8dc2-9c01cc20ef69', 'Verizon Wireless', true, '910000000001'),
  ('US-AT',  '4c4a6a74-68a1-4a4f-8dc2-9c01cc20ef69', 'AT&T Wireless',    true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Canada (CA)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('CA-RG',  'd2b19ed4-1b85-4847-82cd-8076b5fc7566', 'Rogers',           true, '910000000001'),
  ('CA-BL',  'd2b19ed4-1b85-4847-82cd-8076b5fc7566', 'Bell Mobility',    true, '910000000001'),
  ('CA-TL',  'd2b19ed4-1b85-4847-82cd-8076b5fc7566', 'Telus Mobility',   true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;

-- Spain (ES)
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
VALUES
  ('ES-MB',  '0d38993c-72ad-400a-8db7-0c10d0cbe6ac', 'Movistar Spain',   true, '910000000001'),
  ('ES-OR',  '0d38993c-72ad-400a-8db7-0c10d0cbe6ac', 'Orange Spain',     true, '910000000001'),
  ('ES-VF',  '0d38993c-72ad-400a-8db7-0c10d0cbe6ac', 'Vodafone Spain',   true, '910000000001')
ON CONFLICT (ding_operator_code) DO NOTHING;
