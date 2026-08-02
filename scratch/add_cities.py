import sys

filepath = 'packages/database/prisma/schema.prisma'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Helper function to add a field to a model
def add_field_to_model(content, model_name, field_def):
    target = f"model {model_name} {{"
    start = content.find(target)
    if start == -1:
        print(f"Could not find {model_name}")
        return content
    
    # find the next '{'
    block_start = content.find('{', start)
    # inject the field right after '{'
    return content[:block_start+1] + f"\n  {field_def}" + content[block_start+1:]

content = add_field_to_model(content, "Inventory", 'city        String    @default("tashkent")')
content = add_field_to_model(content, "GrowBatch", 'city        String    @default("tashkent")')
content = add_field_to_model(content, "Employee", 'city        String    @default("tashkent")')
content = add_field_to_model(content, "DeliveryRoute", 'city        String    @default("tashkent")')
content = add_field_to_model(content, "Restaurant", 'city        String    @default("tashkent")')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
