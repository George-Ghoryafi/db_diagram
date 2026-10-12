export const example = `// Edit this DBML or ask your agent to edit schemas/commerce.dbml.
// DBML is portable to dbdiagram.io.
Project Commerce { database_type: 'PostgreSQL' }

Table users [headercolor: #365d7e] {
  id integer [pk, increment]
  email varchar(255) [not null, unique]
  full_name varchar(100)
  created_at timestamp [default: \`now()\`]
  indexes { email [unique, name: 'users_email_idx'] }
}

Table addresses [headercolor: #365d7e] {
  id integer [pk, increment]
  user_id integer [not null, ref: > users.id]
  street varchar(255)
  city varchar(100)
  country varchar(2)
}

Table categories [headercolor: #6e5b93] {
  id integer [pk, increment]
  name varchar(100) [not null]
  slug varchar(100) [unique]
}

Table products [headercolor: #6e5b93] {
  id integer [pk, increment]
  category_id integer [ref: > categories.id]
  name varchar(255) [not null]
  price decimal(10,2) [not null]
  stock integer [default: 0]
  indexes { (category_id, name) [name: 'products_category_idx'] }
}

Table orders [headercolor: #2d817d] {
  id integer [pk, increment]
  user_id integer [not null, ref: > users.id]
  status varchar(30) [default: 'pending']
  total decimal(10,2)
  created_at timestamp [default: \`now()\`]
  indexes { (user_id, created_at) [name: 'orders_user_date_idx'] }
}

Table order_items [headercolor: #2d817d] {
  id integer [pk, increment]
  order_id integer [not null, ref: > orders.id]
  product_id integer [not null, ref: > products.id]
  quantity integer [not null]
  unit_price decimal(10,2) [not null]
  indexes { (order_id, product_id) [unique] }
}

Table payments [headercolor: #2d817d] {
  id integer [pk, increment]
  order_id integer [not null, ref: > orders.id]
  amount decimal(10,2)
  method varchar(30)
  paid_at timestamp
}

TableGroup customers [color: #e8eff9] {
  users
  addresses
}

TableGroup fulfillment [color: #e1f1ee] {
  orders
  order_items
  payments
}
`;
