"use client";

import { Card, CardBody, Input } from "@heroui/react";
import { motion } from "framer-motion";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type LoginFormState } from "@/app/actions/auth";
import { AdminButton } from "@/components/ui/admin-button";

const initialState: LoginFormState = {
  error: null
};

const inputClassNames = {
  base: "w-full",
  mainWrapper: "w-full",
  inputWrapper: "panel-input-hero min-h-12 rounded-[0.95rem] shadow-none",
  input: "text-[15px] text-ink placeholder:text-subtle-ink"
};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <Card className="glass-panel w-full rounded-[1.2rem] border-none shadow-none">
      <CardBody className="space-y-5 p-5 sm:p-6">
        <div className="space-y-2.5">
          <p className="panel-kicker">Đăng nhập quản trị</p>
          <h2 className="panel-title-lg font-display">Vào panel vận hành</h2>
          <p className="panel-copy">
            Cookie session vẫn được ký an toàn. Sau khi đăng nhập, bạn sẽ vào thẳng dashboard giám sát bot,
            Lavalink, log hệ thống và guild settings.
          </p>
        </div>

        {state.error ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            data-tone="danger"
            className="panel-notice rounded-[1rem] px-4 py-3 text-sm"
          >
            {state.error}
          </motion.div>
        ) : null}

        <form action={formAction} className="space-y-4">
          <div className="panel-field">
            <label className="panel-field-label" htmlFor="login-username">
              Tên đăng nhập
            </label>
            <Input
              isRequired
              autoComplete="username"
              classNames={inputClassNames}
              id="login-username"
              name="username"
              placeholder="admin"
              radius="lg"
              size="lg"
              type="text"
            />
          </div>

          <div className="panel-field">
            <label className="panel-field-label" htmlFor="login-password">
              Mật khẩu
            </label>
            <Input
              isRequired
              autoComplete="current-password"
              classNames={inputClassNames}
              id="login-password"
              name="password"
              placeholder="Nhập mật khẩu admin"
              radius="lg"
              size="lg"
              type="password"
            />
          </div>

          <LoginSubmitButton />
        </form>
      </CardBody>
    </Card>
  );
}

function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <AdminButton className="w-full" isLoading={pending} kind="solid" radius="full" size="lg" tone="accent" type="submit">
      Vào dashboard
    </AdminButton>
  );
}
