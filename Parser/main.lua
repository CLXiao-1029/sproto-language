-- local in_path = '../SSSlime/SSSlime/Assets/Game/Scripts/LuaScripts/Shared/Proto/proto.sproto'
-- local out_path = '../SSSlime/SSSlime/Assets/Game/Scripts/LuaScripts/Shared/Proto/ProtoComment.lua'

local in_path,out_path = ...

local function readall(path)
	local f = assert(io.open(path))
	local chunk = f:read'*a'
	f:close()
	return chunk
end

local parser = require 'parser'
local structs = parser.parse(readall(in_path)).type

local basetype_map = {
	string = 'string',
	integer = 'number',
	boolean = 'boolean',
}

local function get_typename(field)
	return basetype_map[field.typename] or field.typename
end

local function get_struct(name)
	return structs[name] or error(string.format('unknown struct "%s"', name), 0)
end

local function get_field(struct_name, field_name)
	for _, field in next, get_struct(struct_name) do
		if field.name == field_name then
			return field
		end
	end
	error(string.format('field "%s" of struct "%s" not found', field_name, struct_name), 0)
end

local function get_keyval_typename(struct_name, field_name)
	local struct = get_struct(struct_name)
	if field_name == "" then
		return get_typename(struct[1]), get_typename(struct[2])
	end
	local field = get_field(struct_name, field_name)
	return get_typename(field), struct_name
end

local function gen_field(field)
	if field.array and field.key then
		local key_type, val_type = get_keyval_typename(field.typename, field.key)
		return string.format('%s table<%s, %s>', field.name, key_type, val_type)
	elseif field.array then
		return string.format('%s %s[]', field.name, get_typename(field))
	else
		return string.format('%s %s', field.name, get_typename(field))
	end
end

local function gen_struct(name, struct)
	local buffer = {
		'---@class ' .. name
	}
	for _, field in next, struct do
		buffer[#buffer+1] = '---@field ' .. gen_field(field)
	end
	buffer[#buffer+1] = ''
	return table.concat(buffer, '\n')
end

local f = io.open(out_path, 'w+')
-- 排序
local keys = {}
for name, struct in next, structs do
	keys[#keys+1] = name
end
table.sort(keys)

for i = 1, #keys do
	local key = keys[i]
	local struct = structs[key]
	f:write(gen_struct(key, struct), '\n')
end
-- for name, struct in next, structs do
-- 	f:write(gen_struct(name, struct), '\n')
-- end
f:close()
os.exit()
