import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center py-12">
      <SignUp />
    </main>
  );
}
